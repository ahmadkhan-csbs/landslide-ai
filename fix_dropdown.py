import re

with open('dashboard/script.js', 'r', encoding='utf-8') as f:
    content = f.read()

bad_chunk = "function openSubscribeModal() { document.getElementById('subscribeModal').style.display = 'flex'; }"

good_chunk = """function openSubscribeModal() {
  const select = document.getElementById('subDistrict');
  if (allAlerts && allAlerts.length > 0 && select.options.length <= 7) {
    select.innerHTML = '<option value="">Select District...</option>';
    const cities = [...new Set(allAlerts.map(a => a.name))].sort();
    cities.forEach(city => {
      const opt = document.createElement('option');
      opt.value = city;
      opt.textContent = city;
      select.appendChild(opt);
    });
  }
  document.getElementById('subscribeModal').style.display = 'flex';
}"""

if bad_chunk in content:
    content = content.replace(bad_chunk, good_chunk)
    with open('dashboard/script.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Success fixing openSubscribeModal')
else:
    print('Bad chunk not found for openSubscribeModal.')
