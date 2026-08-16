#!/usr/bin/env python3
"""Generate audio files for all 290 situation questions in childKits."""

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
SITUATIONS_FILE = DATA_DIR / "situations.json"

VOICE_ZH = "zh-TW-HsiaoChenNeural"
VOICE_EN = "en-US-AnaNeural"
RATE = "-10%"

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
    """Generate all audio files for situations."""
    tasks = []

    print("Loading situations.json...")
    with open(SITUATIONS_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    questions = data['questions']
    print(f"Found {len(questions)} questions")

    # Collect all generation tasks
    print("\nPreparing generation tasks...")
    for question in questions:
        q_id = question['id']
        q_text = question['question']
        e_text = question['explanation']
        options = question['options']

        # Question audio
        q_path = AUDIO_DIR / "sit" / f"{q_id}-q.mp3"
        tasks.append((q_path, q_text, VOICE_ZH, f"sit/{q_id}-q"))

        # Option audio (for each option)
        for i, option in enumerate(options):
            o_text = option['text']
            o_path = AUDIO_DIR / "sit" / f"{q_id}-o{i}.mp3"
            tasks.append((o_path, o_text, VOICE_ZH, f"sit/{q_id}-o{i}"))

        # Explanation audio
        e_path = AUDIO_DIR / "sit" / f"{q_id}-e.mp3"
        tasks.append((e_path, e_text, VOICE_ZH, f"sit/{q_id}-e"))

    print(f"Total tasks: {len(tasks)}")

    # Generate audio files
    print(f"\nGenerating audio files (max 4 concurrent)...")
    start_time = time.time()

    results = await asyncio.gather(
        *[generate_audio(text, voice, output_path)
          for output_path, text, voice, _ in tasks],
        return_exceptions=False
    )

    elapsed = time.time() - start_time

    # Count results
    success_count = sum(1 for success, _ in results if success and _ != "skipped (exists)")
    skipped_count = sum(1 for success, _ in results if _ == "skipped (exists)")
    failed_count = sum(1 for success, _ in results if not success)

    print(f"\nGeneration results:")
    print(f"  Generated: {success_count} files")
    print(f"  Skipped: {skipped_count} files")
    print(f"  Failed: {failed_count} files")
    print(f"  Time: {elapsed:.1f}s")

    # Report failed files
    if failed_count > 0:
        print(f"\nFailed files:")
        for (output_path, text, voice, label), (success, msg) in zip(tasks, results):
            if not success:
                print(f"  {label}: {msg}")

    return success_count, skipped_count, failed_count


async def verify_files():
    """Verify that all 290 questions have complete audio files."""
    print("\nVerifying audio files...")

    with open(SITUATIONS_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    questions = data['questions']
    errors = []

    for question in questions:
        q_id = question['id']
        options = question['options']

        # Check question file
        q_path = AUDIO_DIR / "sit" / f"{q_id}-q.mp3"
        if not (q_path.exists() and q_path.stat().st_size > 2048):
            errors.append(f"Missing or too small: {q_id}-q.mp3")

        # Check option files
        for i in range(len(options)):
            o_path = AUDIO_DIR / "sit" / f"{q_id}-o{i}.mp3"
            if not (o_path.exists() and o_path.stat().st_size > 2048):
                errors.append(f"Missing or too small: {q_id}-o{i}.mp3")

        # Check explanation file
        e_path = AUDIO_DIR / "sit" / f"{q_id}-e.mp3"
        if not (e_path.exists() and e_path.stat().st_size > 2048):
            errors.append(f"Missing or too small: {q_id}-e.mp3")

    if errors:
        print(f"Verification FAILED with {len(errors)} errors:")
        for error in errors[:10]:
            print(f"  {error}")
        if len(errors) > 10:
            print(f"  ... and {len(errors) - 10} more")
        return False
    else:
        print(f"Verification OK: All 290 questions have complete audio")
        return True


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
        parts = file_path.split('/')
        if len(parts) >= 2:
            dir_name = parts[1]  # audio/xxx/...
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

    # Validate manifest: each path must exist on disk
    missing_in_disk = []
    for file_path in all_files:
        full_path = AUDIO_DIR / file_path.replace("audio/", "")
        if not full_path.exists():
            missing_in_disk.append(file_path)

    if missing_in_disk:
        print(f"\nWARNING: {len(missing_in_disk)} files in manifest don't exist on disk:")
        for f in missing_in_disk[:5]:
            print(f"  {f}")
        if len(missing_in_disk) > 5:
            print(f"  ... and {len(missing_in_disk) - 5} more")

    # Validate: each mp3 on disk must be in manifest
    all_disk_files = []
    for root, dirs, files in os.walk(AUDIO_DIR):
        for file in files:
            if file.endswith('.mp3'):
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, AUDIO_DIR)
                rel_path = rel_path.replace(os.sep, '/')
                disk_path = f"audio/{rel_path}"
                all_disk_files.append(disk_path)

    all_disk_files.sort()
    missing_in_manifest = [f for f in all_disk_files if f not in all_files]

    if missing_in_manifest:
        print(f"\nWARNING: {len(missing_in_manifest)} files on disk are not in manifest:")
        for f in missing_in_manifest[:5]:
            print(f"  {f}")
        if len(missing_in_manifest) > 5:
            print(f"  ... and {len(missing_in_manifest) - 5} more")

    return len(all_files), total_mb, len(missing_in_disk), len(missing_in_manifest)


async def main():
    """Main entry point."""
    print("=" * 60)
    print("ChildKits Audio Generation - Situations (Batch 2)")
    print("=" * 60)

    # Generate files
    generated, skipped, failed = await generate_all()

    # Verify
    verify_ok = await verify_files()
    if not verify_ok:
        print("\nWarning: Some verification checks failed!")

    # Update manifest
    total_files, total_mb, missing_disk, missing_manifest = await scan_and_update_manifest()

    print("\n" + "=" * 60)
    print("Generation Summary")
    print("=" * 60)
    print(f"Files generated: {generated}")
    print(f"Files skipped: {skipped}")
    print(f"Files failed: {failed}")
    print(f"\nManifest validation:")
    print(f"  Files in manifest: {total_files}")
    print(f"  Files missing on disk: {missing_disk}")
    print(f"  Files on disk not in manifest: {missing_manifest}")
    print(f"\nTotal size: {total_mb:.2f} MB")
    print("\nVerification: " + ("PASSED" if verify_ok and missing_disk == 0 and missing_manifest == 0 else "FAILED"))
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
