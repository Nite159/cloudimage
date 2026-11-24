const form = document.querySelector('#form');
const status = document.querySelector('#status');
const result = document.querySelector('#result');
const file = form.elements.image;
const drop = document.querySelector('#drop');
form.elements.quality.oninput = e => document.querySelector('#quality').value = e.target.value;
drop.ondragover = e => e.preventDefault();
drop.ondrop = e => { e.preventDefault(); if(e.dataTransfer.files.length) { const dt = new DataTransfer(); dt.items.add(e.dataTransfer.files[0]); file.files = dt.files; } };
form.onsubmit = async e => {
  e.preventDefault(); result.hidden = true;
  if (!file.files[0] || file.files[0].size > 50*1024*1024) { status.textContent = 'Оберіть файл до 50 МБ.'; return; }
  const button = form.querySelector('button'); button.disabled = true; status.textContent = 'Обробка на сервері…';
  try {
    const response = await fetch('/api/convert', { method: 'POST', body: new FormData(form) });
    const data = await response.json(); if (!response.ok) throw Error(data.error);
    const size = n => (n/1024).toFixed(1) + ' КБ';
    document.querySelector('#stats').textContent = `${size(data.before)} → ${size(data.after)} · ${data.width} × ${data.height} px`;
    document.querySelector('#download').href = data.url;
    document.querySelector('#link').value = new URL(data.url, location.origin).href;
    result.hidden = false; status.textContent = 'Конвертацію завершено.';
  } catch(err) { status.textContent = err.message || 'Помилка сервера.'; } finally { button.disabled = false; }
};
document.querySelector('#copy').onclick = async () => { const link = document.querySelector('#link'); try { await navigator.clipboard.writeText(link.value); status.textContent = 'Посилання скопійовано.'; } catch { link.select(); status.textContent = 'Скопіюйте виділене посилання вручну.'; } };
