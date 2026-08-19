#!/usr/bin/env python3
"""產生數數題新玩法的語音（總共幾個／哪一種最多／序數）。

用法：python3 tools/generate_audio_count.py
"""

import asyncio
import json
from pathlib import Path

import edge_tts

VOICE = "zh-TW-HsiaoChenNeural"
RATE = "-10%"

ROOT = Path(__file__).resolve().parent.parent
AUDIO_DIR = ROOT / "audio"
FRAG_DIR = AUDIO_DIR / "frag"
MANIFEST = AUDIO_DIR / "manifest.json"

PHRASES = {
    "count-total": "數一數，圖裡總共有幾個？",
    "count-most": "數一數，圖裡哪一種最多？",
    "ord-1": "從左邊數過來，第一個是什麼？",
    "ord-2": "從左邊數過來，第二個是什麼？",
    "ord-3": "從左邊數過來，第三個是什麼？",
    "ord-4": "從左邊數過來，第四個是什麼？",
    "ord-5": "從左邊數過來，第五個是什麼？",
    "ord-6": "從左邊數過來，第六個是什麼？",
}

semaphore = asyncio.Semaphore(4)


async def synth(text: str, path: Path) -> bool:
    async with semaphore:
        for attempt in range(3):
            try:
                await edge_tts.Communicate(text, VOICE, rate=RATE).save(str(path))
                if path.exists() and path.stat().st_size > 1000:
                    return True
            except Exception as exc:
                print(f"  retry {path.name}: {exc}")
            await asyncio.sleep(2 ** attempt)
        return False


async def main() -> None:
    FRAG_DIR.mkdir(parents=True, exist_ok=True)
    rels = [f"audio/frag/{k}.mp3" for k in PHRASES]
    results = await asyncio.gather(*[synth(t, FRAG_DIR / f"{k}.mp3") for k, t in PHRASES.items()])
    ok = sum(1 for r in results if r)
    print(f"generated {ok}/{len(PHRASES)}")
    if ok != len(PHRASES):
        raise SystemExit("有音檔沒產生成功，manifest 不更新")

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    files = set(manifest["files"])
    files.update(rels)
    manifest["files"] = sorted(files)
    MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"manifest: {len(manifest['files'])} files")


if __name__ == "__main__":
    asyncio.run(main())
