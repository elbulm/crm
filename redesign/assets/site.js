(()=>{
  const descriptions={
    contour:'Спокойный рабочий интерфейс: понятная навигация и карточка рядом со списком. Рекомендуемый вариант.',
    register:'Больше данных на экране: плотная таблица, сохранённые представления и отдельная карточка записи.',
    focus:'Работа по этапам: выразительная боковая навигация, доска сделок и акцент на следующем действии.'
  };
  const names={contour:'Контур',register:'Реестр',focus:'Фокус'};
  function showConcept(){
    const requested=location.hash.slice(1);
    const active=Object.hasOwn(descriptions,requested)?requested:'contour';
    document.querySelectorAll('[data-concept]').forEach(link=>{
      if(link.dataset.concept===active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    });
    Object.keys(descriptions).forEach(slug=>{document.getElementById('panel-'+slug).hidden=slug!==active;});
    document.getElementById('concept-note').textContent=descriptions[active];
    document.title=names[active]+' — редизайн Интеграма';
  }
  const theme=document.getElementById('preview-theme');
  function applyTheme(){
    const value=theme.value;
    document.documentElement.dataset.theme=value;
    document.documentElement.style.colorScheme=value==='system'?'light dark':value;
    document.dispatchEvent(new Event('preview-theme'));
    try{localStorage.setItem('integram-preview-theme',value);}catch{}
  }
  try{const saved=localStorage.getItem('integram-preview-theme');if(['system','light','dark'].includes(saved))theme.value=saved;}catch{}
  theme.addEventListener('change',applyTheme);
  window.addEventListener('hashchange',showConcept);
  showConcept();applyTheme();
})();
