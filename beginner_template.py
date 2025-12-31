"""
Beginner-friendly Python template showing the basics of functions, loops,
and simple data handling. Run this file directly to see how each section works.
"""

from pathlib import Path


def greet_user(name: str) -> str:
    """Return a friendly greeting for the provided name."""
    return f"Hello, {name or 'friend'}!"


def summarize_numbers(values: list[int]) -> dict[str, float]:
    """
    Calculate basic statistics for a list of numbers.

    The returned dictionary makes it easy to access each value by name.
    """
    total = sum(values)
    average = total / len(values) if values else 0
    return {"total": total, "average": average, "count": len(values)}


def collect_notes(notes: list[str]) -> None:
    """
    Ask the user to enter short text notes until they submit an empty line.
    New notes are appended to the provided list.
    """
    print("\nType a note and press Enter. Submit an empty line to finish.\n")
    while True:
        note = input("Note: ").strip()
        if not note:
            break
        notes.append(note)


def save_notes(notes: list[str], destination: Path) -> None:
    """Save the provided notes to a text file, one per line."""
    destination.write_text("\n".join(notes), encoding="utf-8")
    print(f"\nSaved {len(notes)} notes to {destination}")


def main() -> None:
    """Run a quick demo of the helper functions above."""
    print("=== Welcome to the beginner template ===\n")

    # 1) Greeting
    name = input("What is your name? ").strip()
    print(greet_user(name))

    # 2) Working with numbers
    sample_numbers = [3, 7, 10, 2]
    stats = summarize_numbers(sample_numbers)
    print("\nExample numbers:", sample_numbers)
    print(f"Total: {stats['total']} | Average: {stats['average']:.2f} | Count: {stats['count']}")

    # 3) Collecting and saving notes
    notes: list[str] = []
    collect_notes(notes)
    if notes:
        output_file = Path("my_notes.txt")
        save_notes(notes, output_file)
    else:
        print("No notes entered. Nothing to save.")

    print("\nThanks for trying the template! Feel free to modify it for your own projects.")


if __name__ == "__main__":
    main()
