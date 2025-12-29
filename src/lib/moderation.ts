// src/lib/moderation.ts
import filter from 'leo-profanity';

// Import language dictionaries from naughty-words
// en - English, ru - Russian, fi - Finnish, ko - Korean
import { en, fi, ko, ru } from 'naughty-words';
// Additional popular languages to protect against abusive "guests"
import { de, es, fr, ja, zh } from 'naughty-words';

// 1. Create a combined array of bad words
// We merge all arrays into one flat list.
// filter.add() accepts an array of strings.
const GLOBAL_BAD_WORDS = [
  ...en, 
  ...ru, 
  ...fi, 
  ...ko,
  ...es, // Spanish
  ...fr, // French
  ...de, // German
  ...ja, // Japanese
  ...zh, // Chinese
  'порнхаб', 'xvideos', 'brazzers', 'xnxx', 'redtube', 'pornhub', 
];

// 2. Reset the default dictionary and load our GLOBAL one
// This makes the library check the text against all these languages at once.
filter.clearList();
filter.add(GLOBAL_BAD_WORDS);

/**
 * Checks the text for profanity in multiple languages.
 * Returns true if profanity is found.
 */
export function containsProfanity(text: string | null | undefined): boolean {
  if (!text || text.trim() === '') return false;
  
  // The check() method now searches in our large combined list
  // It also tries to detect "masked" profanity (l33t speak) for Latin-based text.
  return filter.check(text);
}

/**
 * Image file validation (size and type)
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  // Size check (2MB)
  if (file.size > 2 * 1024 * 1024) {
    return { valid: false, error: 'File too large (max 2MB)' };
  }
  
  // Type check
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    return { valid: false, error: 'Invalid file type (JPG/PNG/WEBP only)' };
  }
  
  return { valid: true };
}