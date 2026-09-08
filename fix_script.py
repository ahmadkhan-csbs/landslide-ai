import re

with open('dashboard/script.js', 'r', encoding='utf-8') as f:
    content = f.read()

bad_chunk = """  const state = encodeURIComponent(alert?.state || '');
  fetch(API_BASE + '/emergency-contacts?state=' + state)
    .then(response => response.ok ? response.json() : Promise.reject(new Error('Contacts unavailable')))
    .then(data => {
      contactsBox.innerHTML = '';
      (data.contacts || []).forEach(contact => {
        const card = document.createElement('div');
        card.className = 'emergency-contact';
        const name = document.createElement('b'); name.textContent = contact.name;
        const description = document.createElement('div'); description.textContent = contact.type + ' · ' + contact.scope;
        const call = document.createElement('a'); call.href = 'tel:' + contact.number; call.textContent = 'Call ' + contact.number;
        const source = document.createElement('a'); source.href = contact.verified_source; source.target = '_blank'; source.rel = 'noopener'; source.textContent = ' Official source ↗';
        card.append(name, description, call, source); contactsBox.appendChild(card);
      });
      const note = document.createElement('p'); note.className = 'report-note'; note.textContent = data.notice; contactsBox.appendChild(note);
    })
    .catch(() => { contactsBox.textContent = 'Verified state contacts are unavailable. For immediate danger, call 112.'; });"""

good_chunk = """  contactsBox.innerHTML = '';
  const contacts = [
    { name: 'India Emergency (112)', type: 'Police · Fire · Medical · Disaster', scope: 'Pan-India', number: '112', verified_source: 'https://112.gov.in/' },
    { name: 'NDRF — National Disaster Response Force', type: 'National flood & landslide response teams', scope: 'National HQ', number: '011-24363260', verified_source: 'https://www.ndrf.gov.in/' },
    { name: 'NDRF 4th Battalion (NER-dedicated, Guwahati)', type: 'Rapid deployment — flood, landslide, cyclone', scope: 'Northeast India', number: '0361-2343328', verified_source: 'https://www.ndrf.gov.in/' },
    { name: 'NDMA — National Disaster Management Authority', type: 'National coordination & policy', scope: 'National', number: '011-26701700', verified_source: 'https://ndma.gov.in/' },
    { name: 'Ambulance / Medical Emergency', type: 'Medical emergency ambulance', scope: 'Pan-India', number: '108', verified_source: 'https://nhm.gov.in/' },
    { name: 'All State EOCs (universal)', type: 'State Emergency Operation Centres', scope: 'all NER states', number: '1070', verified_source: 'https://ndma.gov.in/' }
  ];
  
  contacts.forEach(contact => {
    const card = document.createElement('div');
    card.className = 'emergency-contact';
    const name = document.createElement('b'); name.textContent = contact.name;
    const description = document.createElement('div'); description.textContent = contact.type + ' · ' + contact.scope;
    const call = document.createElement('a'); call.href = 'tel:' + contact.number; call.textContent = 'Call ' + contact.number;
    const source = document.createElement('a'); source.href = contact.verified_source; source.target = '_blank'; source.rel = 'noopener'; source.textContent = ' Official source ↗';
    card.append(name, description, call, source); contactsBox.appendChild(card);
  });"""

if bad_chunk in content:
    content = content.replace(bad_chunk, good_chunk)
    with open('dashboard/script.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Success fixing emergency contacts')
else:
    print('Bad chunk not found for emergency contacts.')
