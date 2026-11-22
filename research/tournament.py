"""Run a local Python strategy against the same market engine used by the site."""

import argparse
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent
BOUNDS = {"half": (1, 20), "tilt": (-20, 20), "size": (1, 500)}


def load_strategy(path):
    spec = importlib.util.spec_from_file_location("desk_strategy", path)
    if spec is None or spec.loader is None:
        raise ValueError("Select a Python file ending in .py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    callback = getattr(module, "quote", None)
    if not callable(callback):
        raise ValueError("The strategy must define quote(market)")
    return callback


def checked_quote(callback, market):
    result = callback(market)
    if not isinstance(result, dict):
        raise ValueError("quote(market) must return a dictionary")
    for key, (low, high) in BOUNDS.items():
        value = result.get(key)
        if type(value) is not int or not low <= value <= high:
            raise ValueError(f"{key} must be an integer from {low} to {high}")
    return {key: result[key] for key in BOUNDS}


def run(path, rounds, seed):
    node = shutil.which("node")
    if node is None:
        raise ValueError("Install Node.js 20 or newer to run the shared exchange")
    callback = None
    with subprocess.Popen(
        [node, str(HERE / "exchange.mjs"), str(rounds), str(seed)],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1
    ) as exchange:
        result = None
        try:
            for line in exchange.stdout:
                message = json.loads(line)
                if message["type"] == "start":
                    callback = load_strategy(path)
                elif message["type"] == "quote":
                    reply = checked_quote(callback, message["observation"])
                    exchange.stdin.write(json.dumps(reply, separators=(",", ":")) + "\n")
                    exchange.stdin.flush()
                elif message["type"] == "results":
                    result = message
                    break
        finally:
            if result is None:
                exchange.terminate()
            exchange.stdin.close()
        if exchange.wait() or result is None:
            raise RuntimeError("The exchange exited without completing the tournament")
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("strategy", type=Path, nargs="?", default=HERE / "example_strategy.py")
    parser.add_argument("--rounds", type=int, default=100)
    parser.add_argument("--seed", type=int, default=41726)
    parser.add_argument("--json", action="store_true", help="Output full metrics in cents as JSON")
    args = parser.parse_args()
    if not args.strategy.is_file():
        parser.error("The strategy file does not exist")
    if not 1 <= args.rounds <= 10000 or not 0 <= args.seed <= 4294967295:
        parser.error("Use 1 to 10,000 rounds and a seed from 0 to 4294967295")
    try:
        result = run(args.strategy.resolve(), args.rounds, args.seed)
    except (OSError, ValueError, RuntimeError, SyntaxError) as error:
        parser.exit(1, f"Strategy error: {error}\n")
    if args.json:
        print(json.dumps(result))
        return
    print(f"{args.rounds:,} matched rounds per dealer, starting seed {args.seed}")
    print(f"{'Dealer':18} {'Mean P&L':>12} {'Worst P&L':>12} {'High inventory':>15} {'Fill rate':>10}")
    for row in sorted(result["rows"], key=lambda r: -r["mean"]):
        mean = row["mean"] / 100
        worst = row["worst"] / 100
        print(f"{row['name']:18} {mean:>+12,.2f} {worst:>+12,.2f} {row['extreme']:>14.1%} {row['fillRate']:>10.1%}")


if __name__ == "__main__":
    main()
