import sys

files = ['dashboard/style.css', 'dashboard/admin.css']
for file in files:
    try:
        with open(file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Remove stray '-webkit- ' followed by space
        content = content.replace(' -webkit- ', ' ')

        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Fixed {file}')
    except Exception as e:
        print(e)
