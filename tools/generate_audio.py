#!/usr/bin/env python3
"""
批次生成兒童問答遊戲語音檔案。
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Tuple
import edge_tts


# Configuration
VOICE = "zh-TW-HsiaoChenNeural"
RATE = "-10%"
DATA_FILE = "/home/user/childKits/data/situations.json"
AUDIO_DIR = Path("/home/user/childKits/audio")
SIT_DIR = AUDIO_DIR / "sit"
COMMON_DIR = AUDIO_DIR / "common"
MANIFEST_FILE = AUDIO_DIR / "manifest.json"

# Common praise sentences
PRAISE_SENTENCES = {
    "praise-0": "答對了，你好棒！",
    "praise-1": "太厲害了！",
    "praise-2": "答對囉，繼續加油！",
    "praise-3": "哇，好聰明！",
}

# Wrong answer intro
WRONG_INTRO = "答錯了喔，正確答案是"

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


async def generate_audio(text: str, output_path: Path, retries: int = 3) -> bool:
    """
    Generate audio file for given text.

    Args:
        text: Text to convert to speech
        output_path: Path to save MP3 file
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
                communicate = edge_tts.Communicate(text, VOICE, rate=RATE)
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


async def generate_questions_audio(questions: List[Dict]) -> List[str]:
    """
    Generate audio files for all questions.

    Args:
        questions: List of question dictionaries

    Returns:
        List of generated file paths
    """
    tasks = []
    file_paths = []

    for q in questions:
        q_id = q["id"]
        category = q["category"]

        # Track by category
        if category not in stats["by_category"]:
            stats["by_category"][category] = {"requested": 0, "generated": 0}

        # Question text
        q_path = SIT_DIR / f"{q_id}-q.mp3"
        tasks.append(generate_audio(q["question"], q_path))
        file_paths.append(str(q_path.relative_to(AUDIO_DIR)))
        stats["by_category"][category]["requested"] += 1

        # Options
        for i, option in enumerate(q["options"]):
            o_path = SIT_DIR / f"{q_id}-o{i}.mp3"
            tasks.append(generate_audio(option["text"], o_path))
            file_paths.append(str(o_path.relative_to(AUDIO_DIR)))
            stats["by_category"][category]["requested"] += 1

        # Explanation
        e_path = SIT_DIR / f"{q_id}-e.mp3"
        tasks.append(generate_audio(q["explanation"], e_path))
        file_paths.append(str(e_path.relative_to(AUDIO_DIR)))
        stats["by_category"][category]["requested"] += 1

    # Execute all tasks
    print(f"Generating {len(tasks)} question audio files...")
    results = await asyncio.gather(*tasks)

    # Track successful generations
    for i, result in enumerate(results):
        if result:
            # Find which category this belongs to
            for q in questions:
                q_id = q["id"]
                category = q["category"]
                # Check if this file path is from this question
                file_idx = i
                if file_idx < len(results):
                    # Update category stats if successful
                    if result:
                        stats["by_category"][category]["generated"] += 1
                break

    return file_paths


async def generate_common_audio() -> List[str]:
    """
    Generate common praise and error sentences.

    Returns:
        List of generated file paths
    """
    tasks = []
    file_paths = []

    print("Generating common audio files...")

    # Praise sentences
    for filename, text in PRAISE_SENTENCES.items():
        path = COMMON_DIR / f"{filename}.mp3"
        tasks.append(generate_audio(text, path))
        file_paths.append(str(path.relative_to(AUDIO_DIR)))

    # Wrong intro
    wrong_path = COMMON_DIR / "wrong-intro.mp3"
    tasks.append(generate_audio(WRONG_INTRO, wrong_path))
    file_paths.append(str(wrong_path.relative_to(AUDIO_DIR)))

    # Execute all tasks
    results = await asyncio.gather(*tasks)

    return file_paths


async def main():
    """Main function."""
    print("Loading questions...")

    # Load questions
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    questions = data["questions"]
    print(f"Found {len(questions)} questions")

    # Generate question audio files
    question_files = await generate_questions_audio(questions)

    # Generate common audio files
    common_files = await generate_common_audio()

    # Combine all files
    all_files = question_files + common_files
    all_files.sort()

    # Verify generated files
    print("\nVerifying generated files...")
    verified_count = 0
    total_size = 0
    verified_files = []

    for file_path in all_files:
        full_path = AUDIO_DIR / file_path
        if full_path.exists():
            size = full_path.stat().st_size
            if size > 2048:
                verified_count += 1
                total_size += size
                verified_files.append(file_path)
        else:
            print(f"  WARNING: File missing: {file_path}", file=sys.stderr)

    # Create manifest (paths are relative to the web root, i.e. prefixed with "audio/")
    manifest = {
        "voice": VOICE,
        "files": sorted("audio/" + f if not f.startswith("audio/") else f for f in verified_files)
    }

    with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"Created manifest: {MANIFEST_FILE}")

    # Calculate expected file count
    expected_count = (
        len(questions) * 2  # q and e for each question
        + sum(len(q["options"]) for q in questions)  # options for each question
        + len(PRAISE_SENTENCES) + 1  # common phrases
    )

    # Print report
    print("\n" + "="*60)
    print("REPORT")
    print("="*60)
    print(f"Questions loaded: {len(questions)}")
    print(f"Expected total files: {expected_count}")
    print(f"Verified files: {verified_count}")
    print(f"Total size: {total_size / (1024*1024):.2f} MB")
    print(f"Manifest files: {len(verified_files)}")
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
        for cat, cat_stats in sorted(stats["by_category"].items()):
            print(f"  {cat}: {cat_stats['generated']}/{cat_stats['requested']} generated")
    print()

    # Validation
    if verified_count == expected_count:
        print("✓ Verification PASSED: All expected files generated")
    else:
        print(f"✗ Verification FAILED: Expected {expected_count}, got {verified_count}")
        return 1

    if stats['total_failed'] > 0:
        print(f"⚠ {stats['total_failed']} files failed after retries")
        return 1

    print("="*60)
    return 0


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
