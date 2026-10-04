// The header and footer behaviour a page needs when it loads no page script
// of its own that already provides it (js/script.js, js/product.js and
// js/welcome.js do): the mobile menu toggle, the header shadow on scroll,
// scroll-reveal, and the footer year. Pulled out of the inline block
// wholesale.html once carried, which went with its application form and took
// the mobile menu with it.
(function () {
  const year = document.getElementById('stubYear') || document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const hamburger = document.getElementById('hamburger');
  const mainNav = document.getElementById('mainNav');
  if (hamburger && mainNav) {
    hamburger.addEventListener('click', () => {
      mainNav.classList.toggle('open');
      hamburger.classList.toggle('open');
    });
    mainNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      mainNav.classList.remove('open');
      hamburger.classList.remove('open');
    }));
  }

  const header = document.getElementById('siteHeader');
  if (header) {
    window.addEventListener('scroll', () => {
      header.style.boxShadow = window.scrollY > 20 ? '0 6px 24px -12px rgba(0,0,0,0.5)' : 'none';
    }, { passive: true });
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.15 });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
  }
})();
