#!/usr/bin/env python3
"""Generate third batch of audio files for childKits."""

import asyncio
import json
import os
from pathlib import Path
import sys
import time

try:
    import edge_tts
except ImportError:
    print("Error: edge_tts not installed. Run: pip install edge-tts")
    sys.exit(1)


# Configuration
AUDIO_DIR = Path(__file__).parent.parent / "audio"
DATA_DIR = Path(__file__).parent.parent / "data"
VOCAB_FILE = DATA_DIR / "vocab.json"

VOICE_ZH = "zh-TW-HsiaoChenNeural"
VOICE_EN = "en-US-AnaNeural"
RATE = "-10%"

# Tasks to generate
ODD_TASKS = [
    ("animals", "哪一個不是動物？", VOICE_ZH),
    ("fruits", "哪一個不是水果？", VOICE_ZH),
    ("vehicles", "哪一個不是交通工具？", VOICE_ZH),
    ("clothes", "哪一個不是衣服？", VOICE_ZH),
    ("household", "哪一個不是生活用品？", VOICE_ZH),
]

# Semaphore for concurrency control (limit to 4)
semaphore = asyncio.Semaphore(4)


async def generate_audio(text, voice, output_path, retry_count=3):
    """Generate audio file with retry logic."""
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Skip if file exists and is > 2KB
    if output_path.exists() and output_path.stat().st_size > 2048:
        return True, "skipped (exists)"

    for attempt in range(1, retry_count + 1):
        try:
            async with semaphore:
                communicate = edge_tts.Communicate(text=text, voice=voice, rate=RATE)
                await communicate.save(str(output_path))

            # Verify file size
            if output_path.stat().st_size > 2048:
                return True, "success"
            else:
                output_path.unlink()
                return False, f"file too small"
        except Exception as e:
            if attempt < retry_count:
                wait_time = 2 ** (attempt - 1)  # 2, 4, 8 seconds
                await asyncio.sleep(wait_time)
            else:
                return False, str(e)

    return False, "max retries exceeded"


async def generate_all():
    """Generate all audio files."""
    tasks = []

    print("Loading vocab.json...")
    with open(VOCAB_FILE, 'r', encoding='utf-8') as f:
        vocab = json.load(f)

    # 1. Generate odd-one-out questions
    print("\n1. Generating odd-one-out questions...")
    for category, text, voice in ODD_TASKS:
        output_path = AUDIO_DIR / "odd" / f"{category}.mp3"
        tasks.append((output_path, text, voice, f"odd/{category}"))

    # 2. Generate new color words
    print("2. Generating new color words...")
    colors_to_generate = []
    if "colors" in vocab:
        for color_obj in vocab["colors"]:
            en = color_obj["en"]
            zh = color_obj["zh"]

            # Replace spaces with underscores for filename
            filename_en = en.replace(" ", "_")

            # Check if files exist
            q_path = AUDIO_DIR / "word" / f"colors-{filename_en}-q.mp3"
            w_path = AUDIO_DIR / "word" / f"colors-{filename_en}-w.mp3"

            # Only generate if files don't exist
            if not (q_path.exists() and q_path.stat().st_size > 2048):
                q_text = f"哪一個是{zh}？"
                tasks.append((q_path, q_text, VOICE_ZH, f"colors/{filename_en}-q"))

            if not (w_path.exists() and w_path.stat().st_size > 2048):
                tasks.append((w_path, zh, VOICE_ZH, f"colors/{filename_en}-w"))

    # 3. Generate new shape words
    print("3. Generating new shape words...")
    if "shapes" in vocab:
        for shape_obj in vocab["shapes"]:
            en = shape_obj["en"]
            zh = shape_obj["zh"]

            # Replace spaces with underscores for filename
            filename_en = en.replace(" ", "_")

            # Check if files exist
            q_path = AUDIO_DIR / "word" / f"shapes-{filename_en}-q.mp3"
            w_path = AUDIO_DIR / "word" / f"shapes-{filename_en}-w.mp3"

            # Only generate if files don't exist
            if not (q_path.exists() and q_path.stat().st_size > 2048):
                q_text = f"哪一個是{zh}？"
                tasks.append((q_path, q_text, VOICE_ZH, f"shapes/{filename_en}-q"))

            if not (w_path.exists() and w_path.stat().st_size > 2048):
                tasks.append((w_path, zh, VOICE_ZH, f"shapes/{filename_en}-w"))

    # 4. Generate numbers 0-55
    print("4. Ensuring numbers 0-55 exist...")
    for n in range(56):
        num_path = AUDIO_DIR / "num" / f"{n}.mp3"

        if not (num_path.exists() and num_path.stat().st_size > 2048):
            tasks.append((num_path, str(n), VOICE_ZH, f"num/{n}"))

    # Execute all generation tasks concurrently
    print(f"\nGenerating {len(tasks)} audio files (max 4 concurrent)...")
    results = await asyncio.gather(
        *[generate_audio(text, voice, output_path)
          for output_path, text, voice, _ in tasks],
        return_exceptions=False
    )

    # Report results
    generated = sum(1 for success, _ in results if success)
    print(f"\nGeneration complete: {generated}/{len(tasks)} files")

    # Count by type
    odd_count = sum(1 for _, _, _, label in tasks if label.startswith("odd/"))
    colors_count = sum(1 for _, _, _, label in tasks if label.startswith("colors/"))
    shapes_count = sum(1 for _, _, _, label in tasks if label.startswith("shapes/"))
    num_count = sum(1 for _, _, _, label in tasks if label.startswith("num/"))

    print(f"\nBreakdown:")
    print(f"  Odd-one-out: {odd_count}")
    print(f"  Colors: {colors_count}")
    print(f"  Shapes: {shapes_count}")
    print(f"  Numbers: {num_count}")

    return True


async def verify_files():
    """Verify that all expected files exist and are properly sized."""
    print("\nVerifying generated files...")

    # Expected odd files
    odd_files = [
        AUDIO_DIR / "odd" / "animals.mp3",
        AUDIO_DIR / "odd" / "fruits.mp3",
        AUDIO_DIR / "odd" / "vehicles.mp3",
        AUDIO_DIR / "odd" / "clothes.mp3",
        AUDIO_DIR / "odd" / "household.mp3",
    ]

    # Expected numbers 0-55
    num_files = [AUDIO_DIR / "num" / f"{n}.mp3" for n in range(56)]

    # Verify odd files
    odd_ok = all(f.exists() and f.stat().st_size > 2048 for f in odd_files)
    print(f"Odd-one-out files: {'OK' if odd_ok else 'MISSING'}")

    # Verify numbers
    num_ok = all(f.exists() and f.stat().st_size > 2048 for f in num_files)
    print(f"Numbers 0-55: {'OK' if num_ok else 'MISSING'}")

    # Verify sit and common counts
    sit_count = len(list((AUDIO_DIR / "sit").glob("*.mp3")))
    common_count = len(list((AUDIO_DIR / "common").glob("*.mp3")))
    print(f"sit/ files: {sit_count} (expected 755)")
    print(f"common/ files: {common_count} (expected 5)")

    return odd_ok and num_ok and sit_count == 755 and common_count == 5


async def scan_and_update_manifest():
    """Scan all audio files and update manifest."""
    print("\nScanning audio directory and updating manifest...")

    # Scan all mp3 files
    all_files = []
    for root, dirs, files in os.walk(AUDIO_DIR):
        for file in files:
            if file.endswith('.mp3'):
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, AUDIO_DIR)
                # Convert to forward slashes
                rel_path = rel_path.replace(os.sep, '/')
                all_files.append(f"audio/{rel_path}")

    # Sort files
    all_files.sort()

    # Create manifest
    manifest = {
        "voice": {
            "zh": VOICE_ZH,
            "en": VOICE_EN
        },
        "files": all_files
    }

    # Write manifest
    manifest_path = AUDIO_DIR / "manifest.json"
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"Manifest updated with {len(all_files)} files")

    # Count by directory
    dir_counts = {}
    for file_path in all_files:
        dir_name = file_path.split('/')[1]  # audio/xxx/...
        dir_counts[dir_name] = dir_counts.get(dir_name, 0) + 1

    print("\nFile counts by directory:")
    for dir_name in sorted(dir_counts.keys()):
        print(f"  {dir_name}/: {dir_counts[dir_name]}")

    # Calculate total size
    total_size = 0
    for file_path in all_files:
        full_path = AUDIO_DIR / file_path.replace("audio/", "")
        if full_path.exists():
            total_size += full_path.stat().st_size

    total_mb = total_size / (1024 * 1024)
    print(f"\nTotal size: {total_mb:.2f} MB")

    return len(all_files), total_mb


async def main():
    """Main entry point."""
    print("=" * 60)
    print("ChildKits Audio Generation - Batch 3")
    print("=" * 60)

    # Generate files
    await generate_all()

    # Verify
    verify_ok = await verify_files()
    if not verify_ok:
        print("\nWarning: Some verification checks failed!")

    # Update manifest
    total_files, total_mb = await scan_and_update_manifest()

    print("\n" + "=" * 60)
    print("Generation complete!")
    print(f"Total files in manifest: {total_files}")
    print(f"Total size: {total_mb:.2f} MB")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
