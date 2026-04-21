import re

messages_path = r'd:\xampp\htdocs\nextpos\apps\pos\src\i18n\posMessages.ts'
keys_path = r'd:\xampp\htdocs\nextpos\pos_used_keys.txt'

with open(keys_path, 'r', encoding='utf-16') as f:
    used_keys = [line.strip() for line in f if line.strip() and len(line.strip()) > 3 and '.' in line]

with open(messages_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Separate sections by keys
tr_match = re.search(r'tr: \{(.*?)\s{4}de: \{', content, re.DOTALL)
de_match = re.search(r'de: \{(.*?)\s{4}en: \{', content, re.DOTALL)
en_match = re.search(r'en: \{(.*?)\};', content, re.DOTALL)

def extract_keys(text):
    if not text: return set()
    return set(re.findall(r"['\"]([\w\.]+)['\"]:\s*['\"]", text))

tr_keys = extract_keys(tr_match.group(1)) if tr_match else set()
de_keys = extract_keys(de_match.group(1)) if de_match else set()
en_keys = extract_keys(en_match.group(1)) if en_match else set()

missing = {'tr': [], 'de': [], 'en': []}

for key in used_keys:
    # Special check: some keys might be dynamically constructed but we only care about literal matches here
    if key not in tr_keys: missing['tr'].append(key)
    if key not in de_keys: missing['de'].append(key)
    if key not in en_keys: missing['en'].append(key)

print(f"Total used keys analyzed: {len(used_keys)}")
for lang in ['tr', 'de', 'en']:
    print(f"\nMissing {lang.upper()} ({len(missing[lang])}):")
    if missing[lang]:
        for k in sorted(missing[lang]):
            print(f"  {k}")
    else:
        print("  NONE")
