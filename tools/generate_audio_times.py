#!/usr/bin/env python3
"""產生九九乘法題的語音。

- audio/num/56.mp3 ~ 81.mp3   數字單念（原本只錄到 55，乘法答案最大 81）
- audio/frag/times*.mp3       「乘以」「乘以多少，會等於」，前端拼接成「3 乘以 4，等於多少？」
- audio/times/ex-{a}x{b}.mp3   答錯時的說明「4個3，是12」。
                              台灣課本 a×b 是「b 個 a」（3×4 = 3+3+3+3，3 的 4 倍）

只產生還沒有的檔案。

用法：python3 tools/generate_audio_times.py
"""

import asyncio
import json
from pathlib import Path

import edge_tts

VOICE = "zh-TW-HsiaoChenNeural"
RATE = "-10%"

ROOT = Path(__file__).resolve().parent.parent
AUDIO_DIR = ROOT / "audio"
MANIFEST = AUDIO_DIR / "manifest.json"

FRAGMENTS = {
    "times": "乘以",                       # 3 + 乘以 + 4 + 等於多少？
    "times-what-equals": "乘以多少，會等於",  # 3 + 乘以多少，會等於 + 12
}

MAX_CONCURRENT = 4
semaphore = asyncio.Semaphore(MAX_CONCURRENT)


async def synth(text: str, path: Path) -> bool:
    if path.exists() and path.stat().st_size > 1000:
        return True
    path.parent.mkdir(parents=True, exist_ok=True)
    async with semaphore:
        for attempt in range(3):
            try:
                await edge_tts.Communicate(text, VOICE, rate=RATE).save(str(path))
                if path.exists() and path.stat().st_size > 1000:
                    return True
            except Exception as exc:  # 網路偶發失敗，退避後重試
                print(f"  retry {path.name}: {exc}")
            await asyncio.sleep(2 ** attempt)
        return False


async def main() -> None:
    jobs = {}
    for n in range(56, 82):
        jobs[f"num/{n}"] = str(n)
    for name, text in FRAGMENTS.items():
        jobs[f"frag/{name}"] = text
    for a in range(1, 10):
        for b in range(1, 10):
            jobs[f"times/ex-{a}x{b}"] = f"{b}個{a}，是{a * b}"

    names = list(jobs)
    results = await asyncio.gather(*(synth(jobs[n], AUDIO_DIR / f"{n}.mp3") for n in names))
    failed = [n for n, ok in zip(names, results) if not ok]
    print(f"ok {len(names) - len(failed)}/{len(names)}")
    if failed:
        raise SystemExit(f"有音檔沒產生成功，manifest 不更新：{failed}")

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    files = set(manifest["files"])
    files.update(f"audio/{n}.mp3" for n in names)
    manifest["files"] = sorted(files)
    MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"manifest: {len(manifest['files'])} files")


if __name__ == "__main__":
    asyncio.run(main())
