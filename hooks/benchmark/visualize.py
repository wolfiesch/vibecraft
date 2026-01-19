#!/usr/bin/env python3
"""
Vibecraft Hook Benchmark Visualization

Generates a professional bar chart comparing Bash vs Rust hook performance
using data from hyperfine benchmark results.

Usage:
    python visualize.py                    # Generate both HTML and PNG
    python visualize.py --html-only        # Generate only HTML
    python visualize.py --png-only         # Generate only PNG

Output:
    performance-chart.html  - Interactive Plotly chart
    performance-chart.png   - Static image (1200x600px)
"""

import json
import os
import sys
from pathlib import Path
from typing import NamedTuple


class BenchmarkResult(NamedTuple):
    """Parsed benchmark result for a single implementation."""
    event_type: str
    impl_name: str  # 'Bash' or 'Rust'
    mean_ms: float
    stddev_ms: float
    median_ms: float


def load_benchmark_results(results_dir: Path) -> list[BenchmarkResult]:
    """Load all benchmark results from JSON files.

    Supports two file formats:
    1. Separate files: bash_pre_tool_use.json, rust_pre_tool_use.json
    2. Combined files: pre_tool_use.json (containing both bash and rust results)
    """
    results = []

    for json_file in sorted(results_dir.glob("*.json")):
        stem = json_file.stem  # e.g., "bash_pre_tool_use" or "pre_tool_use"

        with open(json_file, 'r') as f:
            data = json.load(f)

        for result in data.get("results", []):
            command = result.get("command", "")

            # Determine implementation and event type from filename or command
            if stem.startswith("bash_"):
                impl_name = "Bash"
                event_type = stem[5:]  # Remove "bash_" prefix
            elif stem.startswith("rust_"):
                impl_name = "Rust"
                event_type = stem[5:]  # Remove "rust_" prefix
            elif "vibecraft-hook.sh" in command:
                impl_name = "Bash"
                event_type = stem
            elif "/rust/" in command:
                impl_name = "Rust"
                event_type = stem
            else:
                continue

            # Convert seconds to milliseconds
            mean_ms = result["mean"] * 1000
            stddev_ms = result["stddev"] * 1000
            median_ms = result["median"] * 1000

            results.append(BenchmarkResult(
                event_type=event_type,
                impl_name=impl_name,
                mean_ms=mean_ms,
                stddev_ms=stddev_ms,
                median_ms=median_ms,
            ))

    return results


def format_event_name(event_type: str) -> str:
    """Format event type for display."""
    return event_type.replace("_", " ").title()


def generate_chart(results: list[BenchmarkResult], output_dir: Path, html_only: bool = False, png_only: bool = False):
    """Generate the Plotly bar chart."""
    try:
        import plotly.graph_objects as go
    except ImportError:
        print("Error: plotly not installed. Run: pip install plotly kaleido")
        sys.exit(1)

    # Organize data by event type
    event_types = sorted(set(r.event_type for r in results))

    bash_data = {r.event_type: r for r in results if r.impl_name == "Bash"}
    rust_data = {r.event_type: r for r in results if r.impl_name == "Rust"}

    # Prepare data for plotting
    x_labels = [format_event_name(et) for et in event_types]

    bash_means = [bash_data.get(et, BenchmarkResult(et, "Bash", 0, 0, 0)).mean_ms for et in event_types]
    bash_stddevs = [bash_data.get(et, BenchmarkResult(et, "Bash", 0, 0, 0)).stddev_ms for et in event_types]

    rust_means = [rust_data.get(et, BenchmarkResult(et, "Rust", 0, 0, 0)).mean_ms for et in event_types]
    rust_stddevs = [rust_data.get(et, BenchmarkResult(et, "Rust", 0, 0, 0)).stddev_ms for et in event_types]

    # Calculate speedup factors
    speedups = []
    for et in event_types:
        bash_mean = bash_data.get(et, BenchmarkResult(et, "Bash", 1, 0, 0)).mean_ms
        rust_mean = rust_data.get(et, BenchmarkResult(et, "Rust", 1, 0, 0)).mean_ms
        speedup = bash_mean / rust_mean if rust_mean > 0 else 0
        speedups.append(speedup)

    # Colors
    bash_color = "#ff6b35"  # Orange
    rust_color = "#00d4ff"  # Cyan
    bg_color = "#1a1a1a"    # Dark background
    grid_color = "#333333"  # Subtle grid
    text_color = "#e0e0e0"  # Light text

    fig = go.Figure()

    # Bash bars
    fig.add_trace(go.Bar(
        name="Bash (jq + curl)",
        x=x_labels,
        y=bash_means,
        error_y=dict(type='data', array=bash_stddevs, color=bash_color, thickness=1.5),
        marker_color=bash_color,
        marker_line_color=bash_color,
        marker_line_width=1,
        opacity=0.9,
    ))

    # Rust bars
    fig.add_trace(go.Bar(
        name="Rust (compiled)",
        x=x_labels,
        y=rust_means,
        error_y=dict(type='data', array=rust_stddevs, color=rust_color, thickness=1.5),
        marker_color=rust_color,
        marker_line_color=rust_color,
        marker_line_width=1,
        opacity=0.9,
    ))

    # Add speedup annotations above Rust bars
    annotations = []
    for i, (label, speedup, rust_mean, rust_std) in enumerate(zip(x_labels, speedups, rust_means, rust_stddevs)):
        if speedup > 0:
            annotations.append(dict(
                x=label,
                y=rust_mean + rust_std + 2,  # Position above error bar
                text=f"<b>{speedup:.1f}x</b>",
                showarrow=False,
                font=dict(size=11, color=rust_color),
                xshift=20,  # Shift to be above Rust bar (grouped bars offset)
            ))

    # Layout
    fig.update_layout(
        title=dict(
            text="<b>Vibecraft Hook Performance: Bash vs Rust</b>",
            font=dict(size=24, color=text_color),
            x=0.5,
            xanchor='center',
        ),
        xaxis=dict(
            title=dict(text="Event Type", font=dict(size=14, color=text_color)),
            tickfont=dict(size=11, color=text_color),
            tickangle=-30,
            gridcolor=grid_color,
            showgrid=False,
        ),
        yaxis=dict(
            title=dict(text="Latency (milliseconds)", font=dict(size=14, color=text_color)),
            tickfont=dict(size=12, color=text_color),
            gridcolor=grid_color,
            showgrid=True,
            gridwidth=1,
            zeroline=True,
            zerolinecolor=grid_color,
            zerolinewidth=1,
        ),
        barmode='group',
        bargap=0.2,
        bargroupgap=0.1,
        plot_bgcolor=bg_color,
        paper_bgcolor=bg_color,
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="center",
            x=0.5,
            font=dict(size=13, color=text_color),
            bgcolor='rgba(0,0,0,0)',
        ),
        annotations=annotations,
        margin=dict(l=60, r=40, t=100, b=80),
        width=1200,
        height=600,
    )

    # Output files
    html_path = output_dir / "performance-chart.html"
    png_path = output_dir / "performance-chart.png"

    if not png_only:
        fig.write_html(html_path, include_plotlyjs='cdn')
        print(f"Generated: {html_path}")

    if not html_only:
        try:
            fig.write_image(png_path, scale=2)  # 2x scale for crisp image
            print(f"Generated: {png_path}")
        except Exception as e:
            print(f"Warning: Could not generate PNG (install kaleido: pip install kaleido)")
            print(f"  Error: {e}")


def print_summary_table(results: list[BenchmarkResult]):
    """Print a markdown summary table."""
    event_types = sorted(set(r.event_type for r in results))

    bash_data = {r.event_type: r for r in results if r.impl_name == "Bash"}
    rust_data = {r.event_type: r for r in results if r.impl_name == "Rust"}

    print("\n## Summary Table\n")
    print("| Event Type | Bash (ms) | Rust (ms) | Speedup |")
    print("|------------|-----------|-----------|---------|")

    for et in event_types:
        bash = bash_data.get(et)
        rust = rust_data.get(et)

        bash_str = f"{bash.mean_ms:.1f} ± {bash.stddev_ms:.1f}" if bash else "N/A"
        rust_str = f"{rust.mean_ms:.1f} ± {rust.stddev_ms:.1f}" if rust else "N/A"

        if bash and rust and rust.mean_ms > 0:
            speedup = bash.mean_ms / rust.mean_ms
            speedup_str = f"**{speedup:.1f}x**"
        else:
            speedup_str = "N/A"

        print(f"| {format_event_name(et)} | {bash_str} | {rust_str} | {speedup_str} |")


def main():
    """Main entry point."""
    # Determine paths
    script_dir = Path(__file__).parent
    results_dir = script_dir / "results"
    output_dir = script_dir

    if not results_dir.exists():
        print(f"Error: Results directory not found: {results_dir}")
        sys.exit(1)

    # Parse arguments
    html_only = "--html-only" in sys.argv
    png_only = "--png-only" in sys.argv

    # Load results
    print(f"Loading benchmark results from: {results_dir}")
    results = load_benchmark_results(results_dir)

    if not results:
        print("Error: No benchmark results found")
        sys.exit(1)

    print(f"Found {len(results)} benchmark results")

    # Generate chart
    generate_chart(results, output_dir, html_only=html_only, png_only=png_only)

    # Print summary
    print_summary_table(results)


if __name__ == "__main__":
    main()
