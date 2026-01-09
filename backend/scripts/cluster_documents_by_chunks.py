#!/usr/bin/env python3
"""
HDBSCAN Clustering Script for Document Collections (Chunk-based)

This script clusters user documents by first clustering chunks, then mapping chunk clusters
back to documents. This approach can capture documents that span multiple topics or have
heterogeneous content.

Installation:
    uv pip install -r requirements-clustering.txt

Usage:
    python cluster_documents_by_chunks.py <user_id> [--min-cluster-size N] [--min-samples N] [--db-path PATH]

Examples:
    python cluster_documents_by_chunks.py user123
    python cluster_documents_by_chunks.py user123 --min-cluster-size 10 --min-samples 10
    python cluster_documents_by_chunks.py user123 --db-path backend/data/berkdoc.db
"""

import argparse
import json
import os
import sqlite3
import sys
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

import hdbscan
import numpy as np
import weaviate
from weaviate.classes.query import Filter
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Default configuration
DEFAULT_WEAVIATE_HOST = os.getenv("WEAVIATE_HOST", "localhost")
DEFAULT_WEAVIATE_PORT = int(os.getenv("WEAVIATE_PORT", "8080"))
DEFAULT_COLLECTION_NAME = "DocumentChunk"
DEFAULT_MIN_CLUSTER_SIZE = 5
DEFAULT_MIN_SAMPLES = 5
DEFAULT_CHUNK_MAJORITY_THRESHOLD = 0.5  # Document assigned to cluster if >50% of chunks are in it


def connect_to_weaviate(host: str = DEFAULT_WEAVIATE_HOST, port: int = DEFAULT_WEAVIATE_PORT):
    """Connect to Weaviate instance."""
    try:
        client = weaviate.connect_to_local(host=host, port=port)
        print(f"✓ Connected to Weaviate at {host}:{port}")
        return client
    except Exception as e:
        print(f"✗ Failed to connect to Weaviate: {e}", file=sys.stderr)
        sys.exit(1)


def get_user_document_ids(db_path: str, user_id: str) -> List[str]:
    """
    Get all document IDs for a user from SQLite database.
    
    Returns:
        List of document IDs
    """
    if not os.path.exists(db_path):
        print(f"✗ Database file not found: {db_path}", file=sys.stderr)
        sys.exit(1)
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        query = "SELECT id FROM documents WHERE user_id = ?"
        cursor.execute(query, (user_id,))
        rows = cursor.fetchall()
        
        doc_ids = [row[0] for row in rows]
        conn.close()
        
        print(f"✓ Found {len(doc_ids)} documents for user {user_id}")
        return doc_ids
    except Exception as e:
        print(f"✗ Error querying database: {e}", file=sys.stderr)
        sys.exit(1)


def fetch_chunks_for_documents(
    client: weaviate.WeaviateClient,
    document_ids: List[str],
    collection_name: str = DEFAULT_COLLECTION_NAME,
    batch_size: int = 50,
) -> List[Tuple]:
    """
    Fetch chunks for a list of documents from Weaviate.
    Queries in batches to avoid hitting the 10,000 result limit.
    
    Args:
        client: Weaviate client
        document_ids: List of document IDs to fetch chunks for
        collection_name: Name of the Weaviate collection
        batch_size: Number of documents to query at once
        
    Returns:
        List of tuples: (documentId, chunkIndex, vector, title, source)
    """
    if not document_ids:
        return []
    
    collection = client.collections.get(collection_name)
    chunks = []
    total_chunks = 0
    
    # Process documents in batches
    for i in range(0, len(document_ids), batch_size):
        batch_doc_ids = document_ids[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        total_batches = (len(document_ids) + batch_size - 1) // batch_size
        
        print(f"  Fetching chunks for batch {batch_num}/{total_batches} ({len(batch_doc_ids)} documents)...", end="\r")
        
        # Create filter for this batch of document IDs using Filter.any_of
        # This creates an OR condition matching any document in the batch
        filters = Filter.any_of([
            Filter.by_property("documentId").equal(doc_id) for doc_id in batch_doc_ids
        ])
        
        # Fetch chunks for this batch
        try:
            query_result = collection.query.fetch_objects(
                limit=10000,  # Max limit per query
                filters=filters,
                include_vector=True,
            )
            
            # Process results
            for item in query_result.objects:
                # Access vector
                vector = item.vector
                if isinstance(vector, dict):
                    vector = vector.get("default") or next(iter(vector.values()))
                if vector is None:
                    continue
                
                # Convert to list if needed
                if not isinstance(vector, list):
                    vector = list(vector)
                
                chunks.append((
                    item.properties.get("documentId"),
                    item.properties.get("chunkIndex"),
                    vector,
                    item.properties.get("title"),
                    item.properties.get("source"),
                ))
                total_chunks += 1
                
        except Exception as e:
            print(f"\n✗ Error fetching chunks for batch: {e}", file=sys.stderr)
            # Continue with next batch
            continue
    
    print(f"\n✓ Fetched {total_chunks} chunks for {len(document_ids)} documents")
    return chunks


def fetch_user_chunks(
    client: weaviate.WeaviateClient,
    user_id: str,
    db_path: str,
    collection_name: str = DEFAULT_COLLECTION_NAME,
):
    """
    Fetch all document chunks for a user from Weaviate with their vectors.
    First gets document IDs from SQLite, then queries Weaviate by document ID.
    This avoids the 10,000 result limit by querying in smaller batches.
    
    Returns:
        List of tuples: (documentId, chunkIndex, vector, title, source)
    """
    print(f"Fetching chunks for user: {user_id}...")
    
    try:
        # Step 1: Get document IDs from SQLite
        document_ids = get_user_document_ids(db_path, user_id)
        
        if not document_ids:
            print(f"⚠ No documents found for user {user_id}")
            return []
        
        # Step 2: Fetch chunks for each document (in batches)
        chunks = fetch_chunks_for_documents(client, document_ids, collection_name)
        
        return chunks
        
    except Exception as e:
        print(f"✗ Error fetching chunks: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


def perform_chunk_clustering(
    chunks: List[Tuple],
    min_cluster_size: int = DEFAULT_MIN_CLUSTER_SIZE,
    min_samples: int = DEFAULT_MIN_SAMPLES,
    metric: str = 'manhattan',
) -> Tuple[np.ndarray, hdbscan.HDBSCAN, List[Tuple]]:
    """
    Perform HDBSCAN clustering directly on chunk embeddings.
    
    Args:
        chunks: List of (documentId, chunkIndex, vector, title, source) tuples
        min_cluster_size: Minimum cluster size
        min_samples: Minimum samples in neighborhood
        metric: Distance metric for clustering
        
    Returns:
        Tuple of (cluster_labels, clusterer, chunks_with_metadata)
    """
    print(f"Performing HDBSCAN clustering on {len(chunks)} chunks...")
    print(f"  Parameters: min_cluster_size={min_cluster_size}, min_samples={min_samples}, metric={metric}")
    
    if len(chunks) < min_cluster_size:
        print(f"⚠ Warning: Only {len(chunks)} chunks, but min_cluster_size={min_cluster_size}")
        print("  Clustering may not produce meaningful results.")
    
    # Prepare data matrix - extract vectors from chunks
    vectors = []
    chunks_with_metadata = []
    
    for doc_id, chunk_idx, vector, title, source in chunks:
        vectors.append(vector)
        chunks_with_metadata.append((doc_id, chunk_idx, title, source))
    
    embeddings_matrix = np.array(vectors, dtype=np.float32)
    
    # Perform clustering on chunks
    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=min_samples,
        metric=metric,
        core_dist_n_jobs=-1,  # Use all available cores
    )
    
    cluster_labels = clusterer.fit_predict(embeddings_matrix)
    
    print(f"✓ Chunk clustering complete")
    print(f"  Found {len(set(cluster_labels)) - (1 if -1 in cluster_labels else 0)} clusters")
    print(f"  Noise chunks: {np.sum(cluster_labels == -1)}")
    
    return cluster_labels, clusterer, chunks_with_metadata


def map_chunk_clusters_to_documents(
    chunks_with_metadata: List[Tuple],
    chunk_cluster_labels: np.ndarray,
    majority_threshold: float = DEFAULT_CHUNK_MAJORITY_THRESHOLD,
) -> Dict[str, Dict]:
    """
    Map chunk clusters back to documents.
    A document is assigned to a cluster if a majority (threshold) of its chunks belong to that cluster.
    
    Args:
        chunks_with_metadata: List of (documentId, chunkIndex, title, source) tuples
        chunk_cluster_labels: Cluster labels for each chunk
        majority_threshold: Minimum fraction of chunks that must be in a cluster for document assignment
        
    Returns:
        Dictionary mapping documentId to {
            'cluster_id': assigned cluster ID (or -1 for noise/multi-cluster),
            'title': document title,
            'source': document source,
            'chunk_count': total chunks,
            'chunk_cluster_distribution': dict of cluster_id -> count,
            'primary_cluster': cluster with most chunks,
            'primary_cluster_ratio': fraction of chunks in primary cluster
        }
    """
    print("Mapping chunk clusters to documents...")
    
    # Group chunks by document
    doc_chunks = defaultdict(list)
    doc_metadata = {}
    
    for i, (doc_id, chunk_idx, title, source) in enumerate(chunks_with_metadata):
        cluster_id = int(chunk_cluster_labels[i])
        doc_chunks[doc_id].append(cluster_id)
        # Store metadata (use first chunk's metadata)
        if doc_id not in doc_metadata:
            doc_metadata[doc_id] = {
                'title': title,
                'source': source,
            }
    
    # Assign documents to clusters based on chunk distribution
    doc_clusters = {}
    
    for doc_id, chunk_clusters in doc_chunks.items():
        total_chunks = len(chunk_clusters)
        
        # Count chunks per cluster
        cluster_counts = defaultdict(int)
        for cluster_id in chunk_clusters:
            cluster_counts[cluster_id] += 1
        
        # Find primary cluster (cluster with most chunks)
        if cluster_counts:
            primary_cluster = max(cluster_counts.items(), key=lambda x: x[1])
            primary_cluster_id, primary_count = primary_cluster
            primary_ratio = primary_count / total_chunks
        else:
            primary_cluster_id = -1
            primary_ratio = 0.0
        
        # Assign document to cluster if majority threshold is met
        assigned_cluster = -1  # Default to noise/multi-cluster
        if primary_ratio >= majority_threshold:
            assigned_cluster = primary_cluster_id
        
        doc_clusters[doc_id] = {
            'cluster_id': assigned_cluster,
            'title': doc_metadata[doc_id]['title'],
            'source': doc_metadata[doc_id]['source'],
            'chunk_count': total_chunks,
            'chunk_cluster_distribution': dict(cluster_counts),
            'primary_cluster': primary_cluster_id,
            'primary_cluster_ratio': primary_ratio,
        }
    
    print(f"✓ Mapped clusters to {len(doc_clusters)} documents")
    return doc_clusters


def get_document_metadata_from_db(db_path: str, user_id: str, doc_ids: List[str]) -> Dict[str, Dict]:
    """
    Optionally fetch document metadata from SQLite database.
    
    Returns:
        Dictionary mapping documentId to metadata
    """
    if not os.path.exists(db_path):
        return {}
    
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Create placeholders for IN clause
        placeholders = ','.join('?' * len(doc_ids))
        query = f"""
            SELECT id, title, source, tags, summary
            FROM documents
            WHERE user_id = ? AND id IN ({placeholders})
        """
        
        cursor.execute(query, [user_id] + doc_ids)
        rows = cursor.fetchall()
        
        metadata = {}
        for row in rows:
            metadata[row['id']] = {
                'title': row['title'],
                'source': row['source'],
                'tags': json.loads(row['tags']) if row['tags'] else [],
                'summary': row['summary'],
            }
        
        conn.close()
        return metadata
    except Exception as e:
        print(f"Warning: Could not fetch metadata from database: {e}", file=sys.stderr)
        return {}


def format_results(
    doc_clusters: Dict[str, Dict],
    min_cluster_size: int,
    min_samples: int,
    majority_threshold: float,
) -> Dict:
    """
    Format clustering results into JSON structure.
    
    Returns:
        Dictionary with clustering results
    """
    # Group documents by assigned cluster
    clusters = defaultdict(list)
    noise = []
    multi_cluster = []  # Documents that didn't meet majority threshold
    
    for doc_id, doc_info in doc_clusters.items():
        cluster_id = doc_info['cluster_id']
        doc_result = {
            'documentId': doc_id,
            'title': doc_info['title'],
            'source': doc_info['source'],
            'chunkCount': doc_info['chunk_count'],
            'primaryCluster': doc_info['primary_cluster'],
            'primaryClusterRatio': round(doc_info['primary_cluster_ratio'], 3),
            'chunkClusterDistribution': doc_info['chunk_cluster_distribution'],
        }
        
        if cluster_id == -1:
            # Check if it's noise (primary cluster is -1) or multi-cluster (didn't meet threshold)
            if doc_info['primary_cluster'] == -1:
                noise.append(doc_result)
            else:
                multi_cluster.append(doc_result)
        else:
            clusters[cluster_id].append(doc_result)
    
    # Build result structure
    result = {
        'totalDocuments': len(doc_clusters),
        'totalClusters': len(clusters),
        'noiseCount': len(noise),
        'multiClusterCount': len(multi_cluster),
        'clusters': {},
        'noise': {
            'documentIds': [doc['documentId'] for doc in noise],
            'documents': noise,
            'count': len(noise),
        },
        'multiCluster': {
            'documentIds': [doc['documentId'] for doc in multi_cluster],
            'documents': multi_cluster,
            'count': len(multi_cluster),
            'description': 'Documents with chunks split across multiple clusters (did not meet majority threshold)',
        },
        'parameters': {
            'min_cluster_size': min_cluster_size,
            'min_samples': min_samples,
            'majority_threshold': majority_threshold,
        },
    }
    
    # Add cluster details
    for cluster_id, docs in clusters.items():
        result['clusters'][str(cluster_id)] = {
            'documentIds': [doc['documentId'] for doc in docs],
            'titles': [doc['title'] for doc in docs],
            'sources': list(set([doc['source'] for doc in docs])),
            'documents': docs,
            'size': len(docs),
        }
    
    return result


def print_statistics(result: Dict):
    """Print clustering statistics."""
    print("\n" + "=" * 60)
    print("CLUSTERING RESULTS (Chunk-based)")
    print("=" * 60)
    print(f"Total Documents: {result['totalDocuments']}")
    print(f"Total Clusters: {result['totalClusters']}")
    print(f"Noise Documents: {result['noiseCount']}")
    print(f"Multi-Cluster Documents: {result['multiClusterCount']}")
    print(f"\nParameters:")
    print(f"  min_cluster_size: {result['parameters']['min_cluster_size']}")
    print(f"  min_samples: {result['parameters']['min_samples']}")
    print(f"  majority_threshold: {result['parameters']['majority_threshold']}")
    
    if result['totalClusters'] > 0:
        print(f"\nCluster Sizes:")
        cluster_sizes = [cluster['size'] for cluster in result['clusters'].values()]
        cluster_sizes.sort(reverse=True)
        for i, size in enumerate(cluster_sizes[:10]):  # Show top 10
            print(f"  Cluster {i}: {size} documents")
        if len(cluster_sizes) > 10:
            print(f"  ... and {len(cluster_sizes) - 10} more clusters")


def main():
    parser = argparse.ArgumentParser(
        description="Cluster user documents by clustering chunks first, then mapping to documents",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("user_id", help="User ID to cluster documents for")
    parser.add_argument(
        "--min-cluster-size",
        type=int,
        default=DEFAULT_MIN_CLUSTER_SIZE,
        help=f"Minimum cluster size (default: {DEFAULT_MIN_CLUSTER_SIZE})",
    )
    parser.add_argument(
        "--min-samples",
        type=int,
        default=DEFAULT_MIN_SAMPLES,
        help=f"Minimum samples in neighborhood (default: {DEFAULT_MIN_SAMPLES})",
    )
    parser.add_argument(
        "--majority-threshold",
        type=float,
        default=DEFAULT_CHUNK_MAJORITY_THRESHOLD,
        help=f"Minimum fraction of chunks in a cluster to assign document (default: {DEFAULT_CHUNK_MAJORITY_THRESHOLD})",
    )
    parser.add_argument(
        "--metric",
        type=str,
        default='manhattan',
        choices=['euclidean', 'manhattan', 'cosine'],
        help="Distance metric for clustering (default: manhattan)",
    )
    parser.add_argument(
        "--db-path",
        type=str,
        default="data/berkdoc.db",
        help="Path to SQLite database (default: data/berkdoc.db)",
    )
    parser.add_argument(
        "--weaviate-host",
        type=str,
        default=DEFAULT_WEAVIATE_HOST,
        help=f"Weaviate host (default: {DEFAULT_WEAVIATE_HOST})",
    )
    parser.add_argument(
        "--weaviate-port",
        type=int,
        default=DEFAULT_WEAVIATE_PORT,
        help=f"Weaviate port (default: {DEFAULT_WEAVIATE_PORT})",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output JSON file path (default: print to stdout)",
    )
    
    args = parser.parse_args()
    
    # Validate parameters
    if args.min_cluster_size < 2:
        print("Error: min_cluster_size must be at least 2", file=sys.stderr)
        sys.exit(1)
    if args.min_samples < 1:
        print("Error: min_samples must be at least 1", file=sys.stderr)
        sys.exit(1)
    if not 0 < args.majority_threshold <= 1:
        print("Error: majority_threshold must be between 0 and 1", file=sys.stderr)
        sys.exit(1)
    
    try:
        # Step 1: Connect to Weaviate
        client = connect_to_weaviate(args.weaviate_host, args.weaviate_port)
        
        # Step 2: Fetch user chunks (requires db_path to get document IDs first)
        # Resolve db_path relative to script directory if needed
        if not os.path.isabs(args.db_path):
            script_dir = os.path.dirname(os.path.abspath(__file__))
            db_path = os.path.join(script_dir, "..", args.db_path)
            db_path = os.path.normpath(db_path)
        else:
            db_path = args.db_path
        
        chunks = fetch_user_chunks(client, args.user_id, db_path)
        
        if not chunks:
            print(f"✗ No chunks found for user: {args.user_id}", file=sys.stderr)
            sys.exit(1)
        
        # Step 3: Perform clustering on chunks directly
        chunk_cluster_labels, clusterer, chunks_with_metadata = perform_chunk_clustering(
            chunks,
            args.min_cluster_size,
            args.min_samples,
            args.metric,
        )
        
        # Step 4: Map chunk clusters back to documents
        doc_clusters = map_chunk_clusters_to_documents(
            chunks_with_metadata,
            chunk_cluster_labels,
            args.majority_threshold,
        )
        
        if len(doc_clusters) < args.min_cluster_size:
            print(
                f"⚠ Warning: Only {len(doc_clusters)} documents after mapping "
                f"(min_cluster_size={args.min_cluster_size})",
                file=sys.stderr,
            )
        
        # Optional: Fetch additional metadata from database
        db_metadata = get_document_metadata_from_db(db_path, args.user_id, list(doc_clusters.keys()))
        # Merge metadata (database takes precedence)
        for doc_id, metadata in db_metadata.items():
            if doc_id in doc_clusters:
                doc_clusters[doc_id].update(metadata)
        
        # Step 5: Format results
        result = format_results(
            doc_clusters,
            args.min_cluster_size,
            args.min_samples,
            args.majority_threshold,
        )
        
        # Add user_id to result
        result['userId'] = args.user_id
        
        # Step 6: Output results
        print_statistics(result)
        
        # Output JSON
        json_output = json.dumps(result, indent=2)
        if args.output:
            with open(args.output, 'w') as f:
                f.write(json_output)
            print(f"\n✓ Results saved to: {args.output}")
        else:
            print("\n" + "=" * 60)
            print("JSON OUTPUT")
            print("=" * 60)
            print(json_output)
        
        # Close Weaviate connection
        client.close()
        
    except KeyboardInterrupt:
        print("\n\n✗ Interrupted by user", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
