from __future__ import annotations

import argparse
import asyncio
import json

from app.config import get_settings
from app.models import AnalyzeRequest, Platform
from app.pipeline import ReviewPipeline


async def _run(args: argparse.Namespace) -> None:
    pipeline = ReviewPipeline(get_settings())
    try:
        if args.command == "demo":
            response = await pipeline.demo(args.sample)
        else:
            payload = AnalyzeRequest(
                platform=Platform(args.platform),
                content_url=args.url,
                creator=args.creator,
                max_items=args.max_items,
                analyze_media=not args.no_media,
            )
            response = await pipeline.analyze(payload)
        print(json.dumps(response.model_dump(mode="json"), ensure_ascii=False, indent=2))
    finally:
        await pipeline.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="TikHub multimodal social content review")
    commands = parser.add_subparsers(dest="command", required=True)

    demo = commands.add_parser("demo", help="Run a no-key fixed TikHub sample")
    demo.add_argument("--sample", choices=("wechat", "douyin"), default="wechat")

    analyze = commands.add_parser("analyze", help="Analyze one URL or a creator feed")
    analyze.add_argument("--platform", choices=[item.value for item in Platform], default="auto")
    source = analyze.add_mutually_exclusive_group(required=True)
    source.add_argument("--url")
    source.add_argument("--creator")
    analyze.add_argument("--max-items", type=int, default=5)
    analyze.add_argument("--no-media", action="store_true")

    asyncio.run(_run(parser.parse_args()))


if __name__ == "__main__":
    main()

