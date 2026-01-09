#!/usr/bin/env python3
"""
HDBSCAN Clustering Script for Document Collections

This script clusters user documents using HDBSCAN algorithm on document-level embeddings.
It fetches document chunks from Weaviate, aggregates embeddings per document, and performs clustering.
It can also generate tree visualizations showing how clusters relate to each other hierarchically.

Installation:
    uv pip install -r requirements-clustering.txt

Usage:
    python cluster_documents.py <user_id> [--min-cluster-size N] [--min-samples N] [--db-path PATH] [--include-tree] [--tree-viewer PATH]

Examples:
    python cluster_documents.py user123
    python cluster_documents.py user123 --min-cluster-size 10 --min-samples 10
    python cluster_documents.py user123 --db-path backend/data/berkdoc.db
    python cluster_documents.py user123 --include-tree --tree-viewer tree.html
    
    # Or generate tree viewer separately from existing JSON:
    python generate_tree_viewer.py results.json tree.html
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
BATCH_SIZE = 1000  # Process chunks in batches for memory efficiency


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


def aggregate_embeddings(chunks: List[Tuple]) -> Dict[str, Dict]:
    """
    Aggregate chunk embeddings per document using mean pooling.
    
    Args:
        chunks: List of (documentId, chunkIndex, vector, title, source) tuples
        
    Returns:
        Dictionary mapping documentId to {
            'embedding': aggregated vector,
            'title': document title,
            'source': document source,
            'chunk_count': number of chunks
        }
    """
    print("Aggregating embeddings per document...")
    
    # Group chunks by documentId
    doc_chunks = defaultdict(list)
    doc_metadata = {}
    
    for doc_id, chunk_idx, vector, title, source in chunks:
        doc_chunks[doc_id].append(vector)
        # Store metadata (use first chunk's metadata)
        if doc_id not in doc_metadata:
            doc_metadata[doc_id] = {
                'title': title,
                'source': source,
            }
    
    # Aggregate embeddings using mean pooling
    doc_embeddings = {}
    for doc_id, vectors in doc_chunks.items():
        # Convert to numpy array for efficient computation
        vectors_array = np.array(vectors, dtype=np.float32)
        
        # Mean pooling
        mean_vector = np.mean(vectors_array, axis=0)
        
        # L2 normalization
        norm = np.linalg.norm(mean_vector)
        if norm > 0:
            mean_vector = mean_vector / norm
        
        doc_embeddings[doc_id] = {
            'embedding': mean_vector,
            'title': doc_metadata[doc_id]['title'],
            'source': doc_metadata[doc_id]['source'],
            'chunk_count': len(vectors),
        }
    
    print(f"✓ Aggregated embeddings for {len(doc_embeddings)} documents")
    return doc_embeddings


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


def perform_clustering(
    doc_embeddings: Dict[str, Dict],
    min_cluster_size: int = DEFAULT_MIN_CLUSTER_SIZE,
    min_samples: int = DEFAULT_MIN_SAMPLES,
) -> Tuple[np.ndarray, hdbscan.HDBSCAN]:
    """
    Perform HDBSCAN clustering on document embeddings.
    
    Args:
        doc_embeddings: Dictionary of document embeddings
        min_cluster_size: Minimum cluster size
        min_samples: Minimum samples in neighborhood
        
    Returns:
        Tuple of (cluster_labels, clusterer)
    """
    print(f"Performing HDBSCAN clustering (min_cluster_size={min_cluster_size}, min_samples={min_samples})...")
    
    if len(doc_embeddings) < min_cluster_size:
        print(f"⚠ Warning: Only {len(doc_embeddings)} documents, but min_cluster_size={min_cluster_size}")
        print("  Clustering may not produce meaningful results.")
    
    # Prepare data matrix
    doc_ids = list(doc_embeddings.keys())
    embeddings_matrix = np.array([doc_embeddings[doc_id]['embedding'] for doc_id in doc_ids])
    
    # Perform clustering
    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=min_samples,
        metric='manhattan',
        core_dist_n_jobs=-1,  # Use all available cores
    )
    
    cluster_labels = clusterer.fit_predict(embeddings_matrix)
    
    print(f"✓ Clustering complete")
    return cluster_labels, clusterer, doc_ids


def extract_tree_structure(
    clusterer: hdbscan.HDBSCAN, 
    doc_ids: List[str], 
    cluster_labels: np.ndarray
) -> Dict:
    """
    Extract the condensed tree structure from HDBSCAN clusterer and map tree nodes to final clusters.
    
    Args:
        clusterer: Fitted HDBSCAN clusterer
        doc_ids: List of document IDs in the same order as the clustering
        cluster_labels: Final cluster labels for each document
        
    Returns:
        Dictionary containing tree structure information with cluster mappings
    """
    try:
        condensed_tree = clusterer.condensed_tree_
        
        # Convert to numpy array (always available)
        tree_array = condensed_tree.to_numpy()
        num_points = len(doc_ids)
        
        # Build complete parent-child mapping from ALL tree edges
        # This includes both point-to-cluster and cluster-to-cluster relationships
        all_children_map = defaultdict(list)  # Maps parent to all children (points and clusters)
        parent_map = {}
        lambda_map = {}
        all_cluster_nodes = set()
        cluster_tree = []  # Only cluster-to-cluster edges (child_size > 1)
        
        # Process all tree edges to build complete hierarchy
        for row in tree_array:
            parent = int(row['parent'])
            child = int(row['child'])
            lambda_val = float(row['lambda_val'])
            child_size = int(row['child_size'])
            
            all_children_map[parent].append(child)
            parent_map[child] = parent
            if child not in lambda_map or lambda_val > lambda_map[child]:
                lambda_map[child] = lambda_val
            
            # Track cluster nodes and cluster-tree edges
            if parent >= num_points:
                all_cluster_nodes.add(parent)
            if child >= num_points:
                all_cluster_nodes.add(child)
            if child_size > 1:
                cluster_tree.append({
                    'parent': parent,
                    'child': child,
                    'lambda_val': lambda_val,
                    'child_size': child_size,
                })
        
        if not cluster_tree:
            return {'tree': [], 'edges': [], 'cluster_mapping': {}}
        
        # Build filtered children_map for cluster_tree (only cluster-to-cluster)
        children_map = defaultdict(list)
        for item in cluster_tree:
            children_map[item['parent']].append({
                'cluster_id': item['child'],
                'lambda_val': item['lambda_val'],
                'size': item['child_size'],
            })
        
        # Recursively collect points for each cluster node
        def collect_points(cluster_id: int) -> set:
            """Collect all point indices that belong to this cluster node."""
            if cluster_id < num_points:
                return {cluster_id}  # Leaf node - it's a point itself
            
            # Internal node - collect points from all children
            points = set()
            for child_id in all_children_map.get(cluster_id, []):
                points.update(collect_points(child_id))
            return points
        
        # Map tree cluster IDs to final cluster labels via documents
        
        tree_to_final_clusters = {}
        for cluster_id in all_cluster_nodes:
            points = collect_points(cluster_id)
            if points:
                # Find which final clusters these points belong to
                final_clusters = set()
                for point_idx in points:
                    if point_idx < len(cluster_labels):
                        final_cluster = int(cluster_labels[point_idx])
                        if final_cluster != -1:  # Ignore noise
                            final_clusters.add(final_cluster)
                if final_clusters:  # Only store if there are final clusters
                    tree_to_final_clusters[cluster_id] = sorted(final_clusters)
        
        # Find root clusters (those >= num_points that are not children of any cluster)
        root_candidates = [c for c in all_cluster_nodes 
                          if c not in parent_map or parent_map.get(c, -1) < num_points]
        if not root_candidates and all_cluster_nodes:
            # All clusters have cluster parents, use the one with highest lambda
            root_candidates = [max(all_cluster_nodes, key=lambda x: lambda_map.get(x, 0))]
        
        # Build tree structure recursively with final cluster mapping
        def build_node(cluster_id: int) -> Dict:
            children = children_map.get(cluster_id, [])
            child_nodes = [build_node(child['cluster_id']) for child in children]
            
            # Get all final clusters for this node
            all_final_clusters = set(tree_to_final_clusters.get(cluster_id, []))
            
            # Get all final clusters from children
            child_final_clusters = set()
            for child_node in child_nodes:
                child_final_clusters.update(child_node.get('final_clusters', []))
            
            # Exclusive final clusters: those in this node but not in any child
            exclusive_final_clusters = sorted(all_final_clusters - child_final_clusters)
            
            return {
                'cluster_id': cluster_id,
                'lambda_val': lambda_map.get(cluster_id, 0.0),
                'final_clusters': sorted(all_final_clusters),  # All final clusters (for reference)
                'exclusive_clusters': exclusive_final_clusters,  # Only clusters not in children
                'children': child_nodes,
            }
        
        # Build tree from roots
        tree_structure = [build_node(root) for root in root_candidates]
        
        return {
            'tree': tree_structure,
            'edges': cluster_tree[:500],  # Limit for JSON size
            'total_edges': len(cluster_tree),
            'cluster_mapping': tree_to_final_clusters,
            'note': 'Tree shows cluster hierarchy. Higher lambda_val means clusters merge later. final_clusters contains all clusters for a node. exclusive_clusters contains only clusters not in children (for parent nodes).',
        }
    except Exception as e:
        print(f"Warning: Could not extract tree structure: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return {'tree': [], 'error': str(e), 'cluster_mapping': {}}


def format_results(
    doc_ids: List[str],
    cluster_labels: np.ndarray,
    doc_embeddings: Dict[str, Dict],
    clusterer: hdbscan.HDBSCAN,
    min_cluster_size: int,
    min_samples: int,
    include_tree: bool = False,
) -> Dict:
    """
    Format clustering results into JSON structure.
    
    Args:
        include_tree: Whether to include tree structure in results
    
    Returns:
        Dictionary with clustering results
    """
    # Group documents by cluster
    clusters = defaultdict(list)
    noise = []
    
    for i, doc_id in enumerate(doc_ids):
        cluster_id = int(cluster_labels[i])
        doc_info = {
            'documentId': doc_id,
            'title': doc_embeddings[doc_id]['title'],
            'source': doc_embeddings[doc_id]['source'],
            'chunkCount': doc_embeddings[doc_id]['chunk_count'],
        }
        
        if cluster_id == -1:
            noise.append(doc_info)
        else:
            clusters[cluster_id].append(doc_info)
    
    # Build result structure
    result = {
        'totalDocuments': len(doc_ids),
        'totalClusters': len(clusters),
        'noiseCount': len(noise),
        'clusters': {},
        'noise': {
            'documentIds': [doc['documentId'] for doc in noise],
            'documents': noise,
            'count': len(noise),
        },
        'parameters': {
            'min_cluster_size': min_cluster_size,
            'min_samples': min_samples,
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
    
    # Add tree structure if requested
    if include_tree:
        result['tree'] = extract_tree_structure(clusterer, doc_ids, cluster_labels)
    
    return result


def print_statistics(result: Dict):
    """Print clustering statistics."""
    print("\n" + "=" * 60)
    print("CLUSTERING RESULTS")
    print("=" * 60)
    print(f"Total Documents: {result['totalDocuments']}")
    print(f"Total Clusters: {result['totalClusters']}")
    print(f"Noise Points: {result['noiseCount']}")
    print(f"\nParameters:")
    print(f"  min_cluster_size: {result['parameters']['min_cluster_size']}")
    print(f"  min_samples: {result['parameters']['min_samples']}")
    
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
        description="Cluster user documents using HDBSCAN",
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
    parser.add_argument(
        "--include-tree",
        action="store_true",
        help="Include tree structure in JSON output",
    )
    parser.add_argument(
        "--tree-viewer",
        type=str,
        default=None,
        help="Path to save interactive HTML tree viewer (e.g., tree.html)",
    )
    
    args = parser.parse_args()
    
    # Validate parameters
    if args.min_cluster_size < 2:
        print("Error: min_cluster_size must be at least 2", file=sys.stderr)
        sys.exit(1)
    if args.min_samples < 1:
        print("Error: min_samples must be at least 1", file=sys.stderr)
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
        
        # Step 3: Aggregate embeddings per document
        doc_embeddings = aggregate_embeddings(chunks)
        
        if len(doc_embeddings) < args.min_cluster_size:
            print(
                f"✗ Insufficient documents ({len(doc_embeddings)}) for clustering "
                f"(min_cluster_size={args.min_cluster_size})",
                file=sys.stderr,
            )
            sys.exit(1)
        
        # Optional: Fetch additional metadata from database (already have db_path)
        db_metadata = get_document_metadata_from_db(db_path, args.user_id, list(doc_embeddings.keys()))
        # Merge metadata (database takes precedence)
        for doc_id, metadata in db_metadata.items():
            if doc_id in doc_embeddings:
                doc_embeddings[doc_id].update(metadata)
        
        # Step 4: Perform clustering
        cluster_labels, clusterer, doc_ids = perform_clustering(
            doc_embeddings,
            args.min_cluster_size,
            args.min_samples,
        )
        
        # Step 5: Format results
        result = format_results(
            doc_ids,
            cluster_labels,
            doc_embeddings,
            clusterer,
            args.min_cluster_size,
            args.min_samples,
            include_tree=args.include_tree,
        )
        
        # Add user_id to result
        result['userId'] = args.user_id
        
        # Step 6: Create tree viewer HTML if requested
        if args.tree_viewer:
            if not args.include_tree:
                print("Warning: --tree-viewer requires --include-tree. Enabling --include-tree automatically.", file=sys.stderr)
                result['tree'] = extract_tree_structure(clusterer, doc_ids, cluster_labels)
            
            # Save temporary JSON file for the tree viewer script
            import tempfile
            temp_json = None
            try:
                # Create temporary JSON file
                with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8') as f:
                    json.dump(result, f, indent=2)
                    temp_json = f.name
                
                # Call the tree viewer generation script
                script_dir = os.path.dirname(os.path.abspath(__file__))
                viewer_script = os.path.join(script_dir, 'generate_tree_viewer.py')
                
                if not os.path.exists(viewer_script):
                    print(f"Error: Tree viewer script not found: {viewer_script}", file=sys.stderr)
                    sys.exit(1)
                
                import subprocess
                result_code = subprocess.run(
                    [sys.executable, viewer_script, temp_json, args.tree_viewer],
                    check=False
                )
                
                if result_code.returncode != 0:
                    print(f"\n✗ Failed to create tree viewer", file=sys.stderr)
                    sys.exit(1)
                    
            except Exception as e:
                print(f"\n✗ Failed to create tree viewer: {e}", file=sys.stderr)
                import traceback
                traceback.print_exc()
                sys.exit(1)
            finally:
                # Clean up temporary file
                if temp_json and os.path.exists(temp_json):
                    try:
                        os.unlink(temp_json)
                    except:
                        pass
        
        # Step 7: Output results
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
