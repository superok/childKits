#!/usr/bin/env python3
"""產生注音符號題的語音（audio/zhuyin/）。

- sym-{key}.mp3    符號本身的讀音。直接把「ㄈ」送給語音合成會唸錯
                   （ㄈ 唸成英文字母 F、ㄆ 唸成「他」），這些在 data/zhuyin.json
                   的 speak 欄位改用同音代表字（ㄈ→佛、ㄆ→坡、ㄩ→淤）。
- ex-{key}.mp3     答錯時的例詞：「爸爸的」（後面接 ㄅ）或「葉子裡面有」（後面接 ㄝ）
- q-which.mp3 等   題目片段，前端拼接成「哪一個是 ㄅ？」「狗 的第一個注音，是哪一個？」

只產生還沒有的檔案。改了 speak 想重錄某個符號，先刪掉那個檔案再跑。

用法：python3 tools/generate_audio_zhuyin.py
"""

import asyncio
import json
from pathlib import Path

import edge_tts

VOICE = "zh-TW-HsiaoChenNeural"
RATE = "-10%"

ROOT = Path(__file__).resolve().parent.parent
AUDIO_DIR = ROOT / "audio"
ZY_DIR = AUDIO_DIR / "zhuyin"
MANIFEST = AUDIO_DIR / "manifest.json"
DATA = ROOT / "data" / "zhuyin.json"

FRAGMENTS = {
    "q-which": "哪一個是",               # 哪一個是 + ㄅ
    "q-find": "找一找，",                # 找一找， + ㄅ + 在哪裡？
    "q-where": "在哪裡？",               # （符號不能放在開頭：一開口就是很短的音，小孩會聽不清楚）
    "q-first": "的第一個注音，是哪一個？",  # 狗 + 的第一個注音，是哪一個？
    "first-is": "的第一個音是",           # 狗 + 的第一個音是 + ㄍ
}

EX_TEMPLATE = {"of": "{}的", "in": "{}裡面有"}

MAX_CONCURRENT = 4
semaphore = asyncio.Semaphore(MAX_CONCURRENT)


async def synth(text: str, path: Path) -> bool:
    if path.exists() and path.stat().st_size > 1000:
        return True
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
    ZY_DIR.mkdir(parents=True, exist_ok=True)
    symbols = json.loads(DATA.read_text(encoding="utf-8"))["symbols"]

    jobs = {}
    for s in symbols:
        jobs[f"sym-{s['key']}"] = s["speak"]
        jobs[f"ex-{s['key']}"] = EX_TEMPLATE[s["exType"]].format(s["example"])
    jobs.update(FRAGMENTS)

    names = list(jobs)
    results = await asyncio.gather(*(synth(jobs[n], ZY_DIR / f"{n}.mp3") for n in names))
    failed = [n for n, ok in zip(names, results) if not ok]
    print(f"ok {len(names) - len(failed)}/{len(names)}")
    if failed:
        raise SystemExit(f"有音檔沒產生成功，manifest 不更新：{failed}")

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    files = set(manifest["files"])
    files.update(f"audio/zhuyin/{n}.mp3" for n in names)
    manifest["files"] = sorted(files)
    MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"manifest: {len(manifest['files'])} files")


if __name__ == "__main__":
    asyncio.run(main())
