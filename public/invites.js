const list = document.querySelector('#inviteList');
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

fetch('/api/public/invites', { cache: 'no-store' })
  .then(response => {
    if (!response.ok) throw new Error('加载失败');
    return response.json();
  })
  .then(data => {
    list.innerHTML = data.invites.length
      ? data.invites.map(item => `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(item.name)}</strong>${item.tags?.length ? `<span class="public-tags">${item.tags.map(tag => `<i>${escapeHtml(tag)}</i>`).join('')}</span>` : ''}</a>`).join('')
      : '<p>暂时没有公开的邀请链接。</p>';
  })
  .catch(() => { list.innerHTML = '<p>邀请链接加载失败，请稍后重试。</p>'; });
