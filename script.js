

  // ─── NAV SCROLL ───
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => nav.classList.toggle('solid', scrollY > 60));

  // ─── MOBILE DRAWER ───
  function openDrawer()  { document.getElementById('drawer').classList.add('open'); document.body.style.overflow='hidden'; }
  function closeDrawer() { document.getElementById('drawer').classList.remove('open'); document.body.style.overflow=''; }

  // ─── REVEAL ───
  const obs = new IntersectionObserver(en => en.forEach(e => { if(e.isIntersecting) e.target.classList.add('vis'); }), { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(r => obs.observe(r));

  // ─── BOOKING BAR DATES ───
  window.addEventListener('DOMContentLoaded', () => {
    const d = new Date(), t = new Date(d); t.setDate(d.getDate()+1);
    const n = new Date(d); n.setDate(d.getDate()+4);
    const fmt = d => d.toISOString().split('T')[0];
    ['bb-checkin','m-checkin'].forEach(id => { const el=document.getElementById(id); if(el) el.value=fmt(t); });
    ['bb-checkout','m-checkout'].forEach(id => { const el=document.getElementById(id); if(el) el.value=fmt(n); });
    updateSummary();
  });

  // ─── MODAL ───
  let curStep = 1;
  function openModal(e) {
    if(e) e.preventDefault();
    document.getElementById('bookingOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    updateSummary();
  }
  function closeModal() {
    document.getElementById('bookingOverlay').classList.remove('open');
    document.body.style.overflow = '';
  }
  function overlayClick(e) { if(e.target === document.getElementById('bookingOverlay')) closeModal(); }
  document.addEventListener('keydown', e => { if(e.key === 'Escape') closeModal(); });

  function goStep(n) {
    curStep = n;
    for(let i=1;i<=4;i++) {
      document.getElementById('pane'+i).classList.toggle('active', i===n);
      document.getElementById('tab'+i).classList.toggle('active', i===n);
    }
    document.getElementById('mBtnBack').style.display = n>1 ? 'inline-block' : 'none';
    document.getElementById('mBtnNext').textContent = n===4 ? 'Confirm & Pay ✓' : 'Continue →';
    document.getElementById('stepCounter').textContent = `Step ${n} of 4`;
  }
  function nextStep() {
    if(curStep === 4) {
      closeModal();
      setTimeout(() => {
        alert('🎉 Booking Confirmed!\n\nThank you for choosing Premier Rentals.\nA confirmation has been sent to your email.\n\nBooking Ref: PR-' + Math.random().toString(36).substr(2,6).toUpperCase());
      }, 300);
      return;
    }
    if(curStep < 4) goStep(curStep+1);
    updateSummary();
  }
  function prevStep() { if(curStep>1) goStep(curStep-1); }

  // Property selection
  function selProp(n) {
    document.getElementById('opt1').classList.toggle('sel', n===1);
    document.getElementById('opt2').classList.toggle('sel', n===2);
    updateSummary();
  }

  // Payment method selection
  function selPay(el) {
    document.querySelectorAll('.pay-logo').forEach(e => e.classList.remove('sel'));
    el.classList.add('sel');
  }

  // Summary update
  function updateSummary() {
    const ci = document.getElementById('m-checkin');
    const co = document.getElementById('m-checkout');
    if(ci) document.getElementById('sum-in').textContent = ci.value || '—';
    if(co) document.getElementById('sum-out').textContent = co.value || '—';
    const prop = document.getElementById('opt1')?.classList.contains('sel') ? 'Premier Pool House' : 'Premier Patio';
    const el = document.getElementById('sum-prop');
    if(el) el.textContent = prop;
  }
  