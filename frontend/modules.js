function toggleSidebar(){ const s=document.querySelector('.sidebar'); if(s) s.classList.toggle('open'); }
function showToast(msg){
  const t=document.getElementById('toast'); if(!t) return;
  t.textContent=msg; t.classList.add('show');
  clearTimeout(showToast._t); showToast._t=setTimeout(()=>t.classList.remove('show'),3000);
}
function comingSoon(name){ showToast(name+' module is coming soon.'); return false; }
document.addEventListener('click',e=>{               // close the mobile menu after choosing a page
  const s=document.querySelector('.sidebar');
  if(s&&s.classList.contains('open')&&!s.contains(e.target)&&!e.target.closest('.menu-btn')) s.classList.remove('open');
});
