import re
with open('apps/pos/src/pages/AdminSettings.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace(
    "allowSelfRegistration: true, pairingSecret: '', linkedDevices: []",
    "allowSelfRegistration: true, pairingSecret: '', deviceNotes: '', linkedDevices: []"
)
with open('apps/pos/src/pages/AdminSettings.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed AdminSettings.tsx')