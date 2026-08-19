#!/usr/bin/env python3
"""產生「答錯時的位置提示」語音（audio/pos/）。

顏色、形狀、圖片這類選項沒有文字，唸「正確答案是紅色」對還不認得紅色的小孩沒有幫助，
所以答錯時多唸一句位置。實際排版會隨螢幕寬度變成一排或兩排，前端量測後挑對應的句子。

用法：python3 tools/generate_audio_pos.py
"""

import asyncio
import json
from pathlib import Path

import edge_tts

VOICE = "zh-TW-HsiaoChenNeural"
RATE = "-10%"

ROOT = Path(__file__).resolve().parent.parent
AUDIO_DIR = ROOT / "audio"
POS_DIR = AUDIO_DIR / "pos"
MANIFEST = AUDIO_DIR / "manifest.json"

PHRASES = {
    # 選項排成一排
    "left": "左邊那一個",
    "mid": "中間那一個",
    "right": "右邊那一個",
    "1of4": "左邊數過來第一個",
    "2of4": "左邊數過來第二個",
    "3of4": "左邊數過來第三個",
    "4of4": "左邊數過來第四個",
    # 選項排成兩排（窄螢幕）
    "top-left": "上面那一排，左邊那一個",
    "top-mid": "上面那一排，中間那一個",
    "top-right": "上面那一排，右邊那一個",
    "top-only": "上面那一個",
    "bottom-left": "下面那一排，左邊那一個",
    "bottom-mid": "下面那一排，中間那一個",
    "bottom-right": "下面那一排，右邊那一個",
    "bottom-only": "下面那一個",
    # 選項排成一直行
    "down-1": "從上面數下來第一個",
    "down-2": "從上面數下來第二個",
    "down-3": "從上面數下來第三個",
    "down-4": "從上面數下來第四個",
}

MAX_CONCURRENT = 4
semaphore = asyncio.Semaphore(MAX_CONCURRENT)


async def synth(text: str, path: Path) -> bool:
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
    POS_DIR.mkdir(parents=True, exist_ok=True)

    tasks = []
    rels = []
    for key, text in PHRASES.items():
        path = POS_DIR / f"pos-{key}.mp3"
        rels.append(f"audio/pos/pos-{key}.mp3")
        tasks.append(synth(text, path))

    results = await asyncio.gather(*tasks)
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
