#!/usr/bin/env python3
"""
Generate HTML Tree Viewer for Cluster Hierarchy

This script takes a JSON file with cluster results (including tree structure)
and generates an interactive HTML viewer for exploring the cluster hierarchy.

Usage:
    python generate_tree_viewer.py <input_json> <output_html>

Example:
    python generate_tree_viewer.py results.json tree.html
"""

import argparse
import json
import os
import sys


def create_tree_viewer_html(tree_data: dict, clusters_data: dict, output_path: str):
    """
    Create an HTML file with an interactive tree viewer for exploring the cluster hierarchy.
    
    Args:
        tree_data: Tree structure from extract_tree_structure
        clusters_data: Cluster information from format_results
        output_path: Path to save the HTML file
    """
    # Resolve output path to absolute path
    if not os.path.isabs(output_path):
        output_path = os.path.abspath(output_path)
    
    # Create output directory if it doesn't exist
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)
    
    # Serialize data to JSON (properly escaped for JavaScript)
    tree_json = json.dumps(tree_data, indent=2)
    clusters_json = json.dumps(clusters_data, indent=2)
    
    # Create HTML content
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cluster Tree Viewer</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #f5f5f5;
            padding: 20px;
        }}
        
        .container {{
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            overflow: hidden;
        }}
        
        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px 30px;
        }}
        
        .header h1 {{
            font-size: 24px;
            margin-bottom: 8px;
        }}
        
        .header p {{
            opacity: 0.9;
            font-size: 14px;
        }}
        
        .controls {{
            padding: 20px 30px;
            background: #fafafa;
            border-bottom: 1px solid #e0e0e0;
            display: flex;
            gap: 15px;
            align-items: center;
            flex-wrap: wrap;
        }}
        
        .search-box {{
            flex: 1;
            min-width: 200px;
        }}
        
        .search-box input {{
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
        }}
        
        .tree-container {{
            padding: 30px;
            max-height: calc(100vh - 250px);
            overflow-y: auto;
        }}
        
        .tree-node {{
            margin: 8px 0;
        }}
        
        .tree-node-header {{
            display: flex;
            align-items: center;
            padding: 10px 15px;
            background: #f8f9fa;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
            user-select: none;
        }}
        
        .tree-node-header:hover {{
            background: #e9ecef;
            border-color: #667eea;
        }}
        
        .tree-node-header.expanded {{
            background: #e7f3ff;
            border-color: #667eea;
        }}
        
        .toggle {{
            width: 20px;
            height: 20px;
            margin-right: 10px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 3px;
            background: #667eea;
            color: white;
            font-size: 12px;
            font-weight: bold;
            flex-shrink: 0;
        }}
        
        .tree-node-header.collapsed .toggle::before {{
            content: '+';
        }}
        
        .tree-node-header.expanded .toggle::before {{
            content: '−';
        }}
        
        .tree-node-header.leaf .toggle {{
            background: #ccc;
            visibility: hidden;
        }}
        
        .node-info {{
            flex: 1;
            display: flex;
            align-items: center;
            gap: 15px;
            flex-wrap: wrap;
        }}
        
        .node-label {{
            font-weight: 600;
            color: #333;
        }}
        
        .node-meta {{
            display: flex;
            gap: 15px;
            font-size: 13px;
            color: #666;
        }}
        
        .meta-item {{
            display: flex;
            align-items: center;
            gap: 4px;
        }}
        
        .meta-badge {{
            background: #667eea;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
        }}
        
        .tree-node-children {{
            margin-left: 30px;
            margin-top: 5px;
            display: none;
        }}
        
        .tree-node.expanded .tree-node-children {{
            display: block;
        }}
        
        .doc-preview {{
            margin-top: 8px;
            padding: 8px 12px;
            background: #fff3cd;
            border-radius: 4px;
            font-size: 12px;
            color: #856404;
            max-height: 100px;
            overflow-y: auto;
            display: none;
        }}
        
        .tree-node.expanded .doc-preview {{
            display: block;
        }}
        
        .cluster-details {{
            margin-top: 10px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 4px;
            border-left: 3px solid #667eea;
            font-size: 13px;
            display: none;
        }}
        
        .tree-node.expanded .cluster-details {{
            display: block;
        }}
        
        .cluster-details h4 {{
            margin-bottom: 10px;
            color: #333;
        }}
        
        .doc-list {{
            list-style: none;
            margin-top: 8px;
        }}
        
        .doc-item {{
            padding: 8px 12px;
            margin: 4px 0;
            background: white;
            border-radius: 4px;
            border: 1px solid #e0e0e0;
            transition: background 0.2s;
        }}
        
        .doc-item:hover {{
            background: #f0f0f0;
            border-color: #667eea;
        }}
        
        .doc-title {{
            font-weight: 500;
            color: #333;
            font-size: 14px;
            margin-bottom: 4px;
        }}
        
        .doc-meta {{
            display: flex;
            gap: 12px;
            font-size: 11px;
            color: #666;
        }}
        
        .doc-source {{
            color: #999;
        }}
        
        .doc-id {{
            font-family: monospace;
            color: #667eea;
        }}
        
        .doc-preview-title {{
            font-weight: 600;
            margin-bottom: 4px;
        }}
        
        .doc-preview-list {{
            list-style: none;
            padding: 0;
            margin: 4px 0 0 0;
        }}
        
        .doc-preview-list li {{
            padding: 2px 0;
            border-bottom: 1px solid #ffeaa7;
        }}
        
        .show-all-btn {{
            margin-top: 8px;
            padding: 6px 12px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: background 0.2s;
        }}
        
        .show-all-btn:hover {{
            background: #5568d3;
        }}
        
        .empty-state {{
            text-align: center;
            padding: 60px 20px;
            color: #999;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🌳 Cluster Tree Viewer</h1>
            <p>Explore the hierarchical structure of document clusters</p>
        </div>
        
        <div class="controls">
            <div class="search-box">
                <input type="text" id="searchInput" placeholder="Search clusters or documents...">
            </div>
            <button onclick="expandAll()" style="padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">Expand All</button>
            <button onclick="collapseAll()" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Collapse All</button>
        </div>
        
        <div class="tree-container" id="treeContainer"></div>
    </div>
    
    <script>
        const treeData = {tree_json};
        const clustersData = {clusters_json};
        
        function renderTree() {{
            const container = document.getElementById('treeContainer');
            
            if (!treeData.tree || treeData.tree.length === 0) {{
                container.innerHTML = '<div class="empty-state">No tree data available</div>';
                return;
            }}
            
            container.innerHTML = treeData.tree.map(node => renderNode(node)).join('');
            
            // Attach click handlers
            document.querySelectorAll('.tree-node-header').forEach(header => {{
                header.addEventListener('click', function() {{
                    const node = this.closest('.tree-node');
                    node.classList.toggle('expanded');
                    this.classList.toggle('expanded');
                }});
            }});
        }}
        
        function renderNode(node, depth = 0) {{
            const clusterId = node.cluster_id;
            const hasChildren = node.children && node.children.length > 0;
            const isLeaf = !hasChildren;
            
            // For parent nodes, use exclusive_clusters (documents not in children)
            // For leaf nodes, use final_clusters (all documents in the node)
            const clustersToShow = hasChildren 
                ? (node.exclusive_clusters || [])
                : (node.final_clusters || []);
            
            let allDocuments = [];
            let allTitles = [];
            
            // Aggregate documents from the clusters to show
            for (const finalClusterId of clustersToShow) {{
                const clusterInfo = clustersData[String(finalClusterId)] || {{}};
                if (clusterInfo.documents) {{
                    allDocuments = allDocuments.concat(clusterInfo.documents);
                    allTitles = allTitles.concat(clusterInfo.titles || []);
                }}
            }}
            
            // Fallback: if no clusters mapped, try direct lookup (backward compatibility)
            if (allDocuments.length === 0 && clustersToShow.length === 0) {{
                const clusterInfo = clustersData[String(clusterId)] || {{}};
                allDocuments = clusterInfo.documents || [];
                allTitles = clusterInfo.titles || [];
            }}
            
            const docCount = allDocuments.length || allTitles.length || 0;
            
            // Preview of document names (first 3)
            const previewTitles = allTitles.slice(0, 3);
            const previewText = previewTitles.length > 0 
                ? previewTitles.join(', ') + (allTitles.length > 3 ? ` (+${{allTitles.length - 3}} more)` : '')
                : '';
            
            // Show cluster mapping - exclusive for parents, all for leaves
            const allFinalClusters = node.final_clusters || [];
            const clusterMappingText = clustersToShow.length > 0 
                ? (hasChildren 
                    ? ` → Exclusive: [${{clustersToShow.join(', ')}}] (of [${{allFinalClusters.join(', ')}}])`
                    : ` → Final: [${{clustersToShow.join(', ')}}]`)
                : '';
            
            let html = `
                <div class="tree-node ${{hasChildren ? '' : 'expanded'}}">
                    <div class="tree-node-header ${{hasChildren ? 'collapsed' : 'leaf'}} ${{hasChildren ? '' : 'expanded'}}">
                        <span class="toggle"></span>
                        <div class="node-info">
                            <span class="node-label">Tree Node ${{clusterId}}${{clusterMappingText}}</span>
                            <div class="node-meta">
                                <span class="meta-item">
                                    <span class="meta-badge">λ: ${{node.lambda_val.toFixed(4)}}</span>
                                </span>
                                ${{docCount > 0 ? `<span class="meta-item">Docs: ${{docCount}}</span>` : ''}}
                            </div>
                        </div>
                    </div>
            `;
            
            // Add document preview in header area (always visible when expanded)
            if (docCount > 0 && previewText) {{
                html += `
                    <div class="doc-preview">
                        <div class="doc-preview-title">Document Names (${{docCount}}):</div>
                        <div style="font-size: 12px; color: #856404;">${{escapeHtml(previewText)}}</div>
                    </div>
                `;
            }}
            
            // Add full cluster details with all documents
            if (allDocuments.length > 0 || allTitles.length > 0) {{
                // Use documents array if available (has more info), otherwise use titles
                const itemsToShow = allDocuments.length > 0 ? allDocuments : allTitles.map(t => ({{title: t}}));
                const uniqueId = 'cluster-' + clusterId + '-' + Math.random().toString(36).substr(2, 9);
                const initialLimit = 20; // Show first 20 by default
                const showAll = itemsToShow.length <= initialLimit;
                
                const clusterLabel = hasChildren
                    ? `Tree Node ${{clusterId}} (Exclusive Clusters: ${{clustersToShow.join(', ')}} of ${{allFinalClusters.join(', ')}})`
                    : `Tree Node ${{clusterId}} (Final Clusters: ${{clustersToShow.join(', ')}})`;
                
                html += `
                    <div class="cluster-details">
                        <h4>All Documents in ${{clusterLabel}} (${{itemsToShow.length}})</h4>
                        <ul class="doc-list" id="${{uniqueId}}-list">
                            ${{itemsToShow.slice(0, initialLimit).map((item, idx) => {{
                                const doc = typeof item === 'string' ? {{title: item}} : item;
                                return `
                                <li class="doc-item">
                                    <div class="doc-title">${{escapeHtml(doc.title || 'Untitled')}}</div>
                                    <div class="doc-meta">
                                        ${{doc.source ? `<span class="doc-source">Source: ${{escapeHtml(doc.source)}}</span>` : ''}}
                                        ${{doc.documentId ? `<span class="doc-id">ID: ${{escapeHtml(doc.documentId)}}</span>` : ''}}
                                        ${{doc.chunkCount ? `<span>Chunks: ${{doc.chunkCount}}</span>` : ''}}
                                    </div>
                                </li>
                                `;
                            }}).join('')}}
                        </ul>
                        ${{!showAll ? `
                            <ul class="doc-list" id="${{uniqueId}}-more" style="display: none;">
                                ${{itemsToShow.slice(initialLimit).map((item, idx) => {{
                                    const doc = typeof item === 'string' ? {{title: item}} : item;
                                    return `
                                    <li class="doc-item">
                                        <div class="doc-title">${{escapeHtml(doc.title || 'Untitled')}}</div>
                                        <div class="doc-meta">
                                            ${{doc.source ? `<span class="doc-source">Source: ${{escapeHtml(doc.source)}}</span>` : ''}}
                                            ${{doc.documentId ? `<span class="doc-id">ID: ${{escapeHtml(doc.documentId)}}</span>` : ''}}
                                            ${{doc.chunkCount ? `<span>Chunks: ${{doc.chunkCount}}</span>` : ''}}
                                        </div>
                                    </li>
                                    `;
                                }}).join('')}}
                            </ul>
                            <button class="show-all-btn" onclick="toggleDocuments('${{uniqueId}}')" id="${{uniqueId}}-btn">
                                Show All ${{itemsToShow.length}} Documents
                            </button>
                        ` : ''}}
                    </div>
                `;
            }}
            
            // Add children
            if (hasChildren) {{
                html += '<div class="tree-node-children">';
                html += node.children.map(child => renderNode(child, depth + 1)).join('');
                html += '</div>';
            }}
            
            html += '</div>';
            return html;
        }}
        
        function escapeHtml(text) {{
            if (text == null) return '';
            const div = document.createElement('div');
            div.textContent = String(text);
            return div.innerHTML;
        }}
        
        function toggleDocuments(uniqueId) {{
            const moreList = document.getElementById(uniqueId + '-more');
            const btn = document.getElementById(uniqueId + '-btn');
            if (moreList && btn) {{
                if (moreList.style.display === 'none') {{
                    moreList.style.display = 'block';
                    btn.textContent = 'Show Less';
                }} else {{
                    moreList.style.display = 'none';
                    const totalCount = moreList.querySelectorAll('.doc-item').length;
                    const list = document.getElementById(uniqueId + '-list');
                    const shownCount = list ? list.querySelectorAll('.doc-item').length : 0;
                    btn.textContent = `Show All ${{shownCount + totalCount}} Documents`;
                }}
            }}
        }}
        
        function expandAll() {{
            document.querySelectorAll('.tree-node').forEach(node => {{
                node.classList.add('expanded');
                const header = node.querySelector('.tree-node-header');
                if (header && !header.classList.contains('leaf')) {{
                    header.classList.add('expanded');
                    header.classList.remove('collapsed');
                }}
            }});
        }}
        
        function collapseAll() {{
            document.querySelectorAll('.tree-node').forEach(node => {{
                node.classList.remove('expanded');
                const header = node.querySelector('.tree-node-header');
                if (header && !header.classList.contains('leaf')) {{
                    header.classList.remove('expanded');
                    header.classList.add('collapsed');
                }}
            }});
        }}
        
        // Search functionality
        document.getElementById('searchInput').addEventListener('input', function(e) {{
            const searchTerm = e.target.value.toLowerCase();
            if (!searchTerm) {{
                document.querySelectorAll('.tree-node').forEach(node => {{
                    node.style.display = '';
                }});
                return;
            }}
            
            document.querySelectorAll('.tree-node').forEach(node => {{
                const text = node.textContent.toLowerCase();
                if (text.includes(searchTerm)) {{
                    node.style.display = '';
                    // Expand parent nodes
                    let parent = node.parentElement;
                    while (parent && parent.classList.contains('tree-node')) {{
                        parent.classList.add('expanded');
                        const header = parent.querySelector('.tree-node-header');
                        if (header) {{
                            header.classList.add('expanded');
                            header.classList.remove('collapsed');
                        }}
                        parent = parent.parentElement;
                    }}
                }} else {{
                    node.style.display = 'none';
                }}
            }});
        }});
        
        // Initial render
        renderTree();
    </script>
</body>
</html>"""
    
    # Write HTML file
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    print(f"✓ Tree viewer HTML saved to: {output_path}")
    print(f"  Open it in your browser to explore the cluster hierarchy")


def main():
    parser = argparse.ArgumentParser(
        description="Generate HTML tree viewer from cluster results JSON",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("input_json", help="Input JSON file with cluster results (must include 'tree' and 'clusters')")
    parser.add_argument("output_html", help="Output HTML file path")
    
    args = parser.parse_args()
    
    # Read input JSON
    if not os.path.exists(args.input_json):
        print(f"Error: Input file not found: {args.input_json}", file=sys.stderr)
        sys.exit(1)
    
    try:
        with open(args.input_json, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in input file: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error reading input file: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Extract tree and clusters data
    tree_data = data.get('tree', {})
    clusters_data = data.get('clusters', {})
    
    if not tree_data:
        print("Warning: No 'tree' data found in JSON. Tree viewer will be empty.", file=sys.stderr)
    
    if not clusters_data:
        print("Warning: No 'clusters' data found in JSON.", file=sys.stderr)
    
    # Generate HTML
    try:
        create_tree_viewer_html(tree_data, clusters_data, args.output_html)
    except Exception as e:
        print(f"Error generating HTML: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
