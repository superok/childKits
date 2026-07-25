#!/usr/bin/env python3
"""
批次生成兒童問答遊戲詞彙和數字語音檔案（第二批）。
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Set, Tuple
import edge_tts


# Configuration
VOICE_ZH = "zh-TW-HsiaoChenNeural"
VOICE_EN = "en-US-AnaNeural"
RATE = "-10%"
VOCAB_FILE = "/home/user/childKits/data/vocab.json"
AUDIO_DIR = Path("/home/user/childKits/audio")
WORD_DIR = AUDIO_DIR / "word"
COUNT_DIR = AUDIO_DIR / "count"
NUM_DIR = AUDIO_DIR / "num"
FRAG_DIR = AUDIO_DIR / "frag"
SIT_DIR = AUDIO_DIR / "sit"
COMMON_DIR = AUDIO_DIR / "common"
MANIFEST_FILE = AUDIO_DIR / "manifest.json"

# Category definitions
COG_CATS = ['animals', 'fruits', 'foods', 'vehicles', 'body', 'nature', 'household', 'clothes']
ALL_CATS = COG_CATS + ['colors', 'shapes']
COUNT_CATS = ['animals', 'fruits', 'foods', 'vehicles']
MEASURE = {'animals': '隻', 'fruits': '顆', 'foods': '個', 'vehicles': '台'}
NOT_COUNTABLE = {'grapes', 'blueberry', 'cherry', 'fries', 'popcorn', 'noodles', 'rice', 'milk', 'sushi'}

# Fixed fragments
FRAGMENTS = {
    "plus": "加",
    "minus": "減",
    "equals-what": "等於多少？",
    "plus-what-equals": "加多少，會等於",
    "minus-what-equals": "減多少，會等於",
    "tie": "平手！大家都好棒！",
}

# Semaphore for concurrent requests
MAX_CONCURRENT = 4
semaphore = asyncio.Semaphore(MAX_CONCURRENT)

# Statistics
stats = {
    "total_requested": 0,
    "total_skipped": 0,
    "total_generated": 0,
    "total_retries": 0,
    "total_failed": 0,
    "by_category": {},
}


async def generate_audio(text: str, output_path: Path, voice: str = VOICE_ZH, retries: int = 3) -> bool:
    """
    Generate audio file for given text.

    Args:
        text: Text to convert to speech
        output_path: Path to save MP3 file
        voice: Voice to use for synthesis
        retries: Number of retry attempts

    Returns:
        True if successful, False otherwise
    """
    global stats

    # Check if file already exists and is valid
    if output_path.exists():
        size = output_path.stat().st_size
        if size > 2048:  # > 2KB
            stats["total_skipped"] += 1
            return True

    # Ensure directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)

    stats["total_requested"] += 1

    for attempt in range(retries):
        try:
            async with semaphore:
                communicate = edge_tts.Communicate(text, voice, rate=RATE)
                await communicate.save(str(output_path))

                # Verify file was created and is valid
                if output_path.exists():
                    size = output_path.stat().st_size
                    if size > 2048:
                        stats["total_generated"] += 1
                        return True
                    else:
                        output_path.unlink()  # Remove invalid file
                        raise Exception(f"Generated file too small: {size} bytes")

        except Exception as e:
            if attempt < retries - 1:
                stats["total_retries"] += 1
                wait_time = [2, 4, 8][attempt]
                print(f"  [Retry {attempt + 1}/{retries}] {output_path.name}: {e}", file=sys.stderr)
                await asyncio.sleep(wait_time)
            else:
                stats["total_failed"] += 1
                print(f"  [FAILED] {output_path.name}: {e}", file=sys.stderr)
                return False

    return False


def load_vocab() -> Dict[str, List[Dict]]:
    """Load vocabulary data."""
    with open(VOCAB_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


async def generate_word_audio(vocab: Dict[str, List[Dict]]) -> Tuple[int, List[str]]:
    """
    Generate word audio files.

    Returns:
        Tuple of (count, file_paths)
    """
    tasks = []
    file_paths = []
    count = 0

    print("Generating word audio files...")

    # Generate for each category and word
    for cat in ALL_CATS:
        if cat not in vocab:
            continue

        if cat not in stats["by_category"]:
            stats["by_category"][cat] = {"requested": 0, "generated": 0}

        for item in vocab[cat]:
            zh = item["zh"]
            en = item["en"]
            # Replace spaces in filename with underscores
            en_safe = en.replace(" ", "_")

            # Chinese question: "哪一個是{zh}？"
            q_text = f"哪一個是{zh}？"
            q_path = WORD_DIR / f"{cat}-{en_safe}-q.mp3"
            tasks.append(generate_audio(q_text, q_path, VOICE_ZH))
            file_paths.append(str(q_path.relative_to(AUDIO_DIR)))
            stats["by_category"][cat]["requested"] += 1
            count += 1

            # Chinese word: "{zh}"
            w_path = WORD_DIR / f"{cat}-{en_safe}-w.mp3"
            tasks.append(generate_audio(zh, w_path, VOICE_ZH))
            file_paths.append(str(w_path.relative_to(AUDIO_DIR)))
            stats["by_category"][cat]["requested"] += 1
            count += 1

            # English files only for COG_CATS
            if cat in COG_CATS:
                # English question: "Find the {en}!"
                eq_text = f"Find the {en}!"
                eq_path = WORD_DIR / f"{cat}-{en_safe}-eq.mp3"
                tasks.append(generate_audio(eq_text, eq_path, VOICE_EN))
                file_paths.append(str(eq_path.relative_to(AUDIO_DIR)))
                stats["by_category"][cat]["requested"] += 1
                count += 1

                # English word: "{en}"
                ew_path = WORD_DIR / f"{cat}-{en_safe}-ew.mp3"
                tasks.append(generate_audio(en, ew_path, VOICE_EN))
                file_paths.append(str(ew_path.relative_to(AUDIO_DIR)))
                stats["by_category"][cat]["requested"] += 1
                count += 1

    print(f"Generating {len(tasks)} word audio files...")
    results = await asyncio.gather(*tasks)

    # Track successful generations
    for cat in stats["by_category"]:
        stats["by_category"][cat]["generated"] = sum(
            1 for i, result in enumerate(results)
            if result and i < len(file_paths)
        )

    return count, file_paths


async def generate_count_audio(vocab: Dict[str, List[Dict]]) -> Tuple[int, List[str]]:
    """
    Generate counting audio files.

    Returns:
        Tuple of (count, file_paths)
    """
    tasks = []
    file_paths = []
    count = 0

    print("Generating count audio files...")

    for cat in COUNT_CATS:
        if cat not in vocab:
            continue

        if cat not in stats["by_category"]:
            stats["by_category"][cat] = {"requested": 0, "generated": 0}

        measure = MEASURE[cat]

        for item in vocab[cat]:
            en = item["en"]
            if en in NOT_COUNTABLE:
                continue

            zh = item["zh"]
            # Count text: "數一數，圖裡有幾{量詞}{zh}？"
            count_text = f"數一數，圖裡有幾{measure}{zh}？"
            en_safe = en.replace(" ", "_")
            count_path = COUNT_DIR / f"{cat}-{en_safe}.mp3"

            tasks.append(generate_audio(count_text, count_path, VOICE_ZH))
            file_paths.append(str(count_path.relative_to(AUDIO_DIR)))
            stats["by_category"][cat]["requested"] += 1
            count += 1

    print(f"Generating {len(tasks)} count audio files...")
    results = await asyncio.gather(*tasks)

    return count, file_paths


async def generate_num_audio() -> Tuple[int, List[str]]:
    """
    Generate number audio files (0-55).

    Returns:
        Tuple of (count, file_paths)
    """
    tasks = []
    file_paths = []
    count = 0

    print("Generating number audio files...")

    # Generate numbers 0 to 55
    for n in range(56):
        num_path = NUM_DIR / f"{n}.mp3"
        tasks.append(generate_audio(str(n), num_path, VOICE_ZH))
        file_paths.append(str(num_path.relative_to(AUDIO_DIR)))
        count += 1

    print(f"Generating {len(tasks)} number audio files...")
    results = await asyncio.gather(*tasks)

    return count, file_paths


async def generate_frag_audio() -> Tuple[int, List[str]]:
    """
    Generate fixed fragment audio files.

    Returns:
        Tuple of (count, file_paths)
    """
    tasks = []
    file_paths = []
    count = 0

    print("Generating fragment audio files...")

    for name, text in FRAGMENTS.items():
        frag_path = FRAG_DIR / f"{name}.mp3"
        tasks.append(generate_audio(text, frag_path, VOICE_ZH))
        file_paths.append(str(frag_path.relative_to(AUDIO_DIR)))
        count += 1

    print(f"Generating {len(tasks)} fragment audio files...")
    results = await asyncio.gather(*tasks)

    return count, file_paths


def get_all_audio_files() -> List[str]:
    """
    Scan entire audio/ directory and return all mp3 files.
    """
    all_files = []
    for root, dirs, files in os.walk(AUDIO_DIR):
        for file in files:
            if file.endswith('.mp3'):
                full_path = Path(root) / file
                rel_path = full_path.relative_to(AUDIO_DIR)
                all_files.append(f"audio/{rel_path}")

    return sorted(all_files)


async def main():
    """Main function."""
    print("Loading vocabulary...")

    # Load vocabulary
    vocab = load_vocab()
    print(f"Loaded {sum(len(items) for items in vocab.values())} vocabulary items")

    # Generate all audio files
    word_count, word_files = await generate_word_audio(vocab)
    count_count, count_files = await generate_count_audio(vocab)
    num_count, num_files = await generate_num_audio()
    frag_count, frag_files = await generate_frag_audio()

    # Scan entire audio/ directory for manifest
    print("\nScanning audio directory for manifest...")
    all_files = get_all_audio_files()
    print(f"Found {len(all_files)} total audio files")

    # Verify generated files
    print("\nVerifying generated files...")
    verified_count = 0
    total_size = 0
    verified_files = []

    for file_path in all_files:
        full_path = AUDIO_DIR / file_path[6:]  # Remove "audio/" prefix
        if full_path.exists():
            size = full_path.stat().st_size
            if size > 2048:
                verified_count += 1
                total_size += size
                verified_files.append(file_path)
            else:
                print(f"  WARNING: File too small: {file_path} ({size} bytes)", file=sys.stderr)
        else:
            print(f"  WARNING: File missing: {file_path}", file=sys.stderr)

    # Create manifest
    manifest = {
        "voice": {
            "zh": VOICE_ZH,
            "en": VOICE_EN
        },
        "files": verified_files
    }

    with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"Created manifest: {MANIFEST_FILE}")

    # Count files by directory
    dir_counts = {}
    for file_path in verified_files:
        parts = file_path.split('/')
        if len(parts) >= 2:
            dir_name = parts[1]
            dir_counts[dir_name] = dir_counts.get(dir_name, 0) + 1

    # Print report
    print("\n" + "="*60)
    print("REPORT")
    print("="*60)
    print(f"Files generated:")
    print(f"  Word files: {word_count}")
    print(f"  Count files: {count_count}")
    print(f"  Number files: {num_count}")
    print(f"  Fragment files: {frag_count}")
    print(f"  Total new files expected: {word_count + count_count + num_count + frag_count}")
    print()
    print(f"Verified files by directory:")
    for dir_name in sorted(dir_counts.keys()):
        print(f"  {dir_name}: {dir_counts[dir_name]}")
    print()
    print(f"Total verified files: {verified_count}")
    print(f"Total size: {total_size / (1024*1024):.2f} MB")
    print()
    print("Statistics:")
    print(f"  Requested: {stats['total_requested']}")
    print(f"  Generated: {stats['total_generated']}")
    print(f"  Skipped (already exist): {stats['total_skipped']}")
    print(f"  Failed: {stats['total_failed']}")
    print(f"  Total retries: {stats['total_retries']}")
    print()

    if stats["by_category"]:
        print("By category:")
        for cat in sorted(stats["by_category"].keys()):
            cat_stats = stats["by_category"][cat]
            print(f"  {cat}: {cat_stats['generated']}/{cat_stats['requested']} generated")
    print()

    # Validation
    expected_new_files = word_count + count_count + num_count + frag_count
    existing_files = dir_counts.get('sit', 0) + dir_counts.get('common', 0)
    expected_total = existing_files + expected_new_files

    # More lenient validation - just check that we have the new files
    print("Validation:")
    if existing_files == 760:  # sit: 755 + common: 5
        print(f"  ✓ Existing files preserved: {existing_files} (sit: {dir_counts.get('sit', 0)}, common: {dir_counts.get('common', 0)})")
    else:
        print(f"  ✗ Existing files count mismatch: {existing_files} (expected 760)", file=sys.stderr)

    if verified_count >= expected_total:
        print(f"  ✓ Total files: {verified_count} >= expected {expected_total}")
    else:
        print(f"  ⚠ Total files: {verified_count} < expected {expected_total}", file=sys.stderr)

    if stats['total_failed'] > 0:
        print(f"  ⚠ {stats['total_failed']} files failed after retries")

    print("="*60)
    return 0 if stats['total_failed'] == 0 else 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
