/**
 * =================================================================
 * CORE CLIENT LOGIC & API BRIDGE (SiP-PKL-Mu Vercel Edition)
 * =================================================================
 */

// ⚠️ GANTI DENGAN URL WEB APP APPS SCRIPT ANDA (/exec)
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz-BaHefZvQ_wFcyFPvzf4Ia7POG7llKGu8ENdSTe_WidXW0w2cA1VBTFUocMFP0-iG/exec";

let currentUser = null;
let rawPresensiData = {};
let rawJurnalMap = {};
let rawSholatMap = {};

// --- FUNGSI UTAMA PENEMBAK API KE APPS SCRIPT ---
async function callApi(action, payload = {}) {
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action, payload })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error("API Call Error:", error);
    return { success: false, message: "Koneksi ke server gagal: " + error.message };
  }
}

// --- INISIALISASI SAAT HALAMAN DIBUKA ---
document.addEventListener("DOMContentLoaded", function() {
  const now = new Date();
  const today = now.getFullYear() + "-" + padZero(now.getMonth() + 1) + "-" + padZero(now.getDate());
  
  // Cek Session Storage untuk Pemulihan Sesi Aman
  const savedUser = sessionStorage.getItem('sippkl_current_user');
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      restoreSessionDashboard();
    } catch(e) {
      sessionStorage.removeItem('sippkl_current_user');
    }
  }

  const bln = now.getMonth() + 1;
  const thn = now.getFullYear();

  ['filterBulan', 'filterBulanJurnal', 'filterBulanSholat'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = bln;
  });
  ['filterTahun', 'filterTahunJurnal', 'filterTahunSholat'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = thn;
  });
  
  ['jurnalTanggal', 'sholatTanggal', 'izinTanggal', 'pdfStart', 'pdfEnd'].forEach(id => {
    const el = document.getElementById(id);
    if(el) {
      el.value = today;
      if (['jurnalTanggal', 'sholatTanggal', 'izinTanggal'].includes(id)) {
        el.setAttribute('max', today);
      }
    }
  });
});

function padZero(num) { return num < 10 ? "0" + num : num; }

function setButtonLoading(btnId, isLoading, originalText, loadingText) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    btn.setAttribute('data-orig-text', originalText);
    btn.innerText = loadingText || "⏳ Memproses...";
  } else {
    btn.disabled = false;
    const orig = btn.getAttribute('data-orig-text');
    btn.innerText = orig || originalText;
  }
}

function showModal(type, title, msg) {
  const iconEl = document.getElementById('modalIcon');
  iconEl.className = 'status-icon';
  if (type === 'success') { iconEl.classList.add('icon-success'); iconEl.innerText = '✓'; }
  else if (type === 'error') { iconEl.classList.add('icon-error'); iconEl.innerText = '✕'; }
  else if (type === 'warning') { iconEl.classList.add('icon-warning'); iconEl.innerText = '⚠️'; }
  
  document.getElementById('modalTitle').innerText = title;
  document.getElementById('modalMsg').innerText = msg;
  document.getElementById('modalAlert').classList.remove('hidden');
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function togglePin(inputId, el) {
  const input = document.getElementById(inputId);
  const eyeOpen = el.querySelector('.eye-open');
  const eyeClosed = el.querySelector('.eye-closed');
  
  if (input.type === "password") {
    input.type = "text";
    eyeOpen.classList.add('hidden');
    eyeClosed.classList.remove('hidden');
  } else {
    input.type = "password";
    eyeOpen.classList.remove('hidden');
    eyeClosed.classList.add('hidden');
  }
}

function toggleFormIzinFoto() {
  const status = document.getElementById('izinStatus').value;
  const groupFoto = document.getElementById('groupFotoIzin');
  if (status === "Libur DUDIKA") {
    groupFoto.classList.add('hidden');
  } else {
    groupFoto.classList.remove('hidden');
  }
}

// --- PROSES LOGIN ---
async function processLogin() {
  const nis = document.getElementById('loginNis').value;
  const pin = document.getElementById('loginPin').value;
  if (!nis || !pin) return showModal('warning', 'Peringatan', 'Mohon isi NIS dan PIN!');
  
  setButtonLoading('btnLogin', true, 'MASUK SYSTEM', '⏳ Verifikasi Login...');
  
  const res = await callApi("loginUser", { nis, pin });
  setButtonLoading('btnLogin', false, 'MASUK SYSTEM');
  
  if (res.success) {
    currentUser = res.user;
    sessionStorage.setItem('sippkl_current_user', JSON.stringify(currentUser));

    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('mainDashboard').classList.remove('hidden');
    
    const uDisp = document.getElementById('userDisplay');
    uDisp.innerText = currentUser.nama + ' (' + currentUser.nis + ')';
    uDisp.classList.remove('hidden');
    
    renderIdentitasSiswa();
    
    const banner = document.getElementById('statusBanner');
    const bannerTitle = document.getElementById('bannerTitle');
    const bannerSub = document.getElementById('bannerSub');

    if (currentUser.statusAkun === "SELESAI") {
      applyReadOnlyModeUI();
    }

    const now = new Date();
    const bln = now.getMonth() + 1;
    const thn = now.getFullYear();

    const initRes = await callApi("getDashboardInitData", { nis: currentUser.nis, bulan: bln, tahun: thn });
    if (initRes.success) {
      if (currentUser.statusAkun !== "SELESAI" && initRes.statusPresensi.success) {
        const st = initRes.statusPresensi;
        bannerTitle.innerText = "Status Hari Ini:";
        
        if (st.state === "BELUM_MASUK") {
          banner.className = "status-banner banner-warning";
          bannerSub.innerText = "Anda belum melakukan Presensi Masuk hari ini!";
        } else if (st.state === "BELUM_CHECKOUT") {
          banner.className = "status-banner banner-info";
          bannerSub.innerText = "Sudah Masuk (" + st.jamMasuk + "). Jangan lupa Checkout Pulang!";
        } else if (st.state === "SUDAH_SELESAI") {
          banner.className = "status-banner banner-success";
          bannerSub.innerText = "Presensi Selesai! Masuk: " + st.jamMasuk + " | Pulang: " + st.jamPulang;
        } else if (st.state === "IZIN_SAKIT") {
          banner.className = "status-banner banner-info";
          bannerSub.innerText = "Status Hari Ini: Pengajuan " + st.status;
        }
      }

      if (initRes.riwayatPresensi.success) {
        renderCalendar(initRes.riwayatPresensi.data, bln, thn, initRes.riwayatPresensi.tglMulaiPkl);
      }
      if (initRes.rekapJurnal.success) {
        rawJurnalMap = initRes.rekapJurnal.mapJurnal || {};
        renderCalendarJurnal(bln, thn);
      }
      if (initRes.rekapSholat.success) {
        rawSholatMap = initRes.rekapSholat.mapSholat || {};
        renderCalendarSholat(bln, thn);
      }
    }
  } else {
    showModal('error', 'Login Gagal', res.message);
  }
}

// --- PEMULIHAN SESI AMAN ---
async function restoreSessionDashboard() {
  if (!currentUser) return;
  
  document.getElementById('loginSection').classList.add('hidden');
  document.getElementById('mainDashboard').classList.remove('hidden');
  
  const uDisp = document.getElementById('userDisplay');
  uDisp.innerText = currentUser.nama + ' (' + currentUser.nis + ')';
  uDisp.classList.remove('hidden');
  
  renderIdentitasSiswa();
  
  if (currentUser.statusAkun === "SELESAI") {
    applyReadOnlyModeUI();
  }

  const now = new Date();
  const bln = now.getMonth() + 1;
  const thn = now.getFullYear();

  const initRes = await callApi("getDashboardInitData", { nis: currentUser.nis, bulan: bln, tahun: thn });
  if (initRes.success) {
    const banner = document.getElementById('statusBanner');
    const bannerTitle = document.getElementById('bannerTitle');
    const bannerSub = document.getElementById('bannerSub');

    if (currentUser.statusAkun !== "SELESAI" && initRes.statusPresensi.success) {
      const st = initRes.statusPresensi;
      bannerTitle.innerText = "Status Hari Ini:";
      
      if (st.state === "BELUM_MASUK") {
        banner.className = "status-banner banner-warning";
        bannerSub.innerText = "Anda belum melakukan Presensi Masuk hari ini!";
      } else if (st.state === "BELUM_CHECKOUT") {
        banner.className = "status-banner banner-info";
        bannerSub.innerText = "Sudah Masuk (" + st.jamMasuk + "). Jangan lupa Checkout Pulang!";
      } else if (st.state === "SUDAH_SELESAI") {
        banner.className = "status-banner banner-success";
        bannerSub.innerText = "Presensi Selesai! Masuk: " + st.jamMasuk + " | Pulang: " + st.jamPulang;
      } else if (st.state === "IZIN_SAKIT") {
        banner.className = "status-banner banner-info";
        bannerSub.innerText = "Status Hari Ini: Pengajuan " + st.status;
      }
    }

    if (initRes.riwayatPresensi.success) {
      renderCalendar(initRes.riwayatPresensi.data, bln, thn, initRes.riwayatPresensi.tglMulaiPkl);
    }
    if (initRes.rekapJurnal.success) {
      rawJurnalMap = initRes.rekapJurnal.mapJurnal || {};
      renderCalendarJurnal(bln, thn);
    }
    if (initRes.rekapSholat.success) {
      rawSholatMap = initRes.rekapSholat.mapSholat || {};
      renderCalendarSholat(bln, thn);
    }
  }
}

function applyReadOnlyModeUI() {
  const banner = document.getElementById('statusBanner');
  const bannerTitle = document.getElementById('bannerTitle');
  const bannerSub = document.getElementById('bannerSub');
  
  banner.className = "status-banner banner-warning";
  banner.style.backgroundColor = "#fef3c7";
  banner.style.borderLeft = "4px solid #d97706";
  banner.style.color = "#92400e";
  
  if(bannerTitle) bannerTitle.innerText = "MASA PKL TELAH SELESAI (NON-AKTIF)";
  if(bannerSub) bannerSub.innerText = "Akun Anda berada dalam Mode Baca. Masa PKL sudah selesai, pengisian presensi dan data baru dinonaktifkan.";

  ['btnPresensiMasuk', 'btnPresensiPulang', 'btnSubmitIzin', 'btnSimpanJurnal', 'btnSimpanSholat', 'btnGantiPin'].forEach(btnId => {
    const btn = document.getElementById(btnId);
    if(btn) {
      btn.disabled = true;
      btn.innerText = "🔒 PKL SELESAI (MODE BACA)";
      btn.style.opacity = "0.6";
    }
  });
}

function renderIdentitasSiswa() {
  if (!currentUser) return;
  document.getElementById('idNama').innerText = currentUser.nama;
  document.getElementById('idTtl').innerText = currentUser.ttl;
  document.getElementById('idNisNisn').innerText = currentUser.nis + " / " + currentUser.nisn;
  document.getElementById('idKelas').innerText = currentUser.kelasAsli + " / " + currentUser.kelasKbm;
  document.getElementById('idProg').innerText = currentUser.programKeahlian;
  document.getElementById('idKons').innerText = currentUser.konsentrasiKeahlian;
  document.getElementById('idPeriode').innerText = currentUser.periodePkl;
  document.getElementById('idDudika').innerText = currentUser.namaDudika;
  document.getElementById('idAlamatDudika').innerText = currentUser.alamatDudika;
  document.getElementById('idGuru').innerText = currentUser.guruPembimbing;
  
  let cp = currentUser.cpGuruPembimbing.toString().replace(/[^0-9]/g, '');
  if (cp.startsWith('0')) cp = '62' + cp.substring(1);
  document.getElementById('btnWaGuru').href = "https://wa.me/" + cp;
}

// --- PRESENSI & KALENDAR ---
async function loadRekapData() {
  if (!currentUser) return;
  const bln = document.getElementById('filterBulan').value;
  const thn = document.getElementById('filterTahun').value;
  
  const res = await callApi("getRiwayatPresensi", { nis: currentUser.nis, bulan: bln, tahun: thn });
  if (res.success) renderCalendar(res.data, parseInt(bln, 10), parseInt(thn, 10), res.tglMulaiPkl);
}

function renderCalendar(presensiList, bulan, tahun, tglMulaiPkl) {
  const container = document.getElementById('calendarContainer');
  container.innerHTML = `
    <div class="cal-header">Sen</div><div class="cal-header">Sel</div><div class="cal-header">Rab</div>
    <div class="cal-header">Kam</div><div class="cal-header">Jum</div><div class="cal-header">Sab</div>
    <div class="cal-header">Min</div>
  `;
  
  rawPresensiData = {};
  presensiList.forEach(p => { rawPresensiData[p.tanggal] = p; });
  
  const todayObj = new Date();
  const todayStr = todayObj.getFullYear() + "-" + padZero(todayObj.getMonth() + 1) + "-" + padZero(todayObj.getDate());

  const firstDay = new Date(tahun, bulan - 1, 1).getDay();
  const startingOffset = (firstDay === 0) ? 6 : firstDay - 1;
  const daysInMonth = new Date(tahun, bulan, 0).getDate();
  
  let cntHadir = 0, cntIzin = 0, cntLiburDudika = 0, cntLiburUmum = 0, cntAlfa = 0, totalJamNum = 0;

  for (let e = 0; e < startingOffset; e++) { container.innerHTML += `<div class="cal-day empty"></div>`; }
  
  for (let d = 1; d <= daysInMonth; d++) {
    const fullDate = tahun + "-" + padZero(bulan) + "-" + padZero(d);
    const currentCheckDate = new Date(tahun, bulan - 1, d);
    const dayOfWeek = currentCheckDate.getDay();
    let statusClass = "";
    const isTodayClass = (fullDate === todayStr) ? " today" : "";
    
    if (rawPresensiData[fullDate]) {
      const itemP = rawPresensiData[fullDate];
      const st = itemP.status;
      if (st === "Hadir") { statusClass = "hadir"; cntHadir++; }
      else if (st === "Izin" || st === "Sakit") { statusClass = "izin"; cntIzin++; }
      else if (st.startsWith("Pending")) { statusClass = "izin-pending"; cntIzin++; }
      else if (st === "Libur DUDIKA") { statusClass = "libur-dudika"; cntLiburDudika++; }
      else if (st === "Alfa") { statusClass = "alfa"; cntAlfa++; }

      const jamVal = parseFloat((itemP.durasi || "0").toString().replace(" Jam", "")) || 0;
      totalJamNum += jamVal;
    } else {
      if (currentCheckDate < new Date(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate())) {
        if (dayOfWeek === 0) { statusClass = "libur-umum"; cntLiburUmum++; }
        else {
          if (tglMulaiPkl && fullDate < tglMulaiPkl) { statusClass = ""; }
          else { statusClass = "alfa"; cntAlfa++; }
        }
      } else if (dayOfWeek === 0) { statusClass = "libur-umum"; cntLiburUmum++; }
    }
    
    container.innerHTML += `<div class="cal-day ${statusClass}${isTodayClass}" onclick="openDetailModal('${fullDate}', ${dayOfWeek}, '${tglMulaiPkl || ''}')">${d}</div>`;
  }

  document.getElementById('sumHadir').innerText = cntHadir;
  document.getElementById('sumIzin').innerText = cntIzin;
  document.getElementById('sumLiburDudika').innerText = cntLiburDudika;
  document.getElementById('sumLiburUmum').innerText = cntLiburUmum;
  document.getElementById('sumAlfa').innerText = cntAlfa;
  document.getElementById('sumJam').innerText = totalJamNum.toFixed(1) + " Jm";
}

function openDetailModal(dateStr, dayOfWeek, tglMulaiPkl) {
  const item = rawPresensiData[dateStr];
  document.getElementById('detTgl').innerText = formatHariTanggalIndo(dateStr);
  const gmapsContainer = document.getElementById('detLokasiContainer');
  
  if (item) {
    let displayStatus = item.status;
    if (displayStatus === "Pending Izin") displayStatus = "🟡 Pending Izin (Menunggu Validasi Guru)";
    else if (displayStatus === "Pending Sakit") displayStatus = "🟡 Pending Sakit (Menunggu Validasi Guru)";
    else if (displayStatus === "Pending Susulan") displayStatus = "🟡 Pending Susulan (Menunggu Validasi Guru)";
    
    document.getElementById('detStatus').innerText = displayStatus;
    document.getElementById('detMasuk').innerText = item.jamMasuk;
    document.getElementById('detPulang').innerText = item.jamPulang;
    document.getElementById('detDurasi').innerText = item.durasi;
    
    if (item.lokasi && item.lokasi !== "-" && item.lokasi.indexOf(",") !== -1) {
      const cleanCoords = item.lokasi.replace(/\s+/g, '');
      document.getElementById('btnGmaps').href = "https://maps.google.com/?q=" + cleanCoords;
      gmapsContainer.classList.remove('hidden');
    } else { gmapsContainer.classList.add('hidden'); }
  } else {
    if (dayOfWeek === 0) { document.getElementById('detStatus').innerText = "Libur Umum (Minggu)"; }
    else if (tglMulaiPkl && dateStr < tglMulaiPkl) { document.getElementById('detStatus').innerText = "Belum Memulai Periode PKL"; }
    else { document.getElementById('detStatus').innerText = "Belum Ada Presensi (Alfa)"; }
    
    document.getElementById('detMasuk').innerText = "-";
    document.getElementById('detPulang').innerText = "-";
    document.getElementById('detDurasi').innerText = "0 Jam";
    gmapsContainer.classList.add('hidden');
  }
  document.getElementById('modalDetail').classList.remove('hidden');
}

// --- JURNAL & SHOLAT ---
async function loadRekapJurnalKalender() {
  if (!currentUser) return;
  const bln = document.getElementById('filterBulanJurnal').value;
  const thn = document.getElementById('filterTahunJurnal').value;
  
  const res = await callApi("getRekapJurnal", { nis: currentUser.nis, bulan: bln, tahun: thn });
  if (res.success) {
    rawJurnalMap = res.mapJurnal || {};
    renderCalendarJurnal(parseInt(bln, 10), parseInt(thn, 10));
  }
}

function renderCalendarJurnal(bulan, tahun) {
  const container = document.getElementById('calendarJurnalContainer');
  container.innerHTML = `
    <div class="cal-header">Sen</div><div class="cal-header">Sel</div><div class="cal-header">Rab</div>
    <div class="cal-header">Kam</div><div class="cal-header">Jum</div><div class="cal-header">Sab</div>
    <div class="cal-header">Min</div>
  `;

  const todayObj = new Date();
  const todayStr = todayObj.getFullYear() + "-" + padZero(todayObj.getMonth() + 1) + "-" + padZero(todayObj.getDate());

  const firstDay = new Date(tahun, bulan - 1, 1).getDay();
  const startingOffset = (firstDay === 0) ? 6 : firstDay - 1;
  const daysInMonth = new Date(tahun, bulan, 0).getDate();

  for (let e = 0; e < startingOffset; e++) { container.innerHTML += `<div class="cal-day empty"></div>`; }
  
  for (let d = 1; d <= daysInMonth; d++) {
    const fullDate = tahun + "-" + padZero(bulan) + "-" + padZero(d);
    let statusClass = "jurnal-kosong";
    const isTodayClass = (fullDate === todayStr) ? " today" : "";
    
    if (rawJurnalMap[fullDate]) {
      const stJurnal = (rawJurnalMap[fullDate].status || "").toString().toUpperCase().trim();
      if (["APPROVED", "DISETUJUI", "ACC"].includes(stJurnal)) { 
        statusClass = "jurnal-approved";
      } else if (["REJECTED", "DITOLAK"].includes(stJurnal)) {
        statusClass = "jurnal-rejected";
      } else { 
        statusClass = "jurnal-pending";
      }
    }
    
    container.innerHTML += `<div class="cal-day ${statusClass}${isTodayClass}" onclick="openDetailJurnalModal('${fullDate}')">${d}</div>`;
  }
}

function openDetailJurnalModal(dateStr) {
  document.getElementById('detJurnalTgl').innerText = formatHariTanggalIndo(dateStr);
  const itemJ = rawJurnalMap[dateStr];

  if (itemJ) {
    const stUpper = (itemJ.status || "").toString().toUpperCase().trim();
    let labelStatus = "🟡 Pending (Menunggu Validasi)";
    if (["APPROVED", "DISETUJUI", "ACC"].includes(stUpper)) {
      labelStatus = "🟢 Tervalidasi Guru";
    } else if (["REJECTED", "DITOLAK", "REVISI"].includes(stUpper)) {
      labelStatus = "🔴 Ditolak / Perlu Perbaikan";
    }

    document.getElementById('detJurnalStatus').innerText = labelStatus;
    document.getElementById('detJurnalDivisi').innerText = itemJ.divisi;
    document.getElementById('detJurnalUraian').innerText = itemJ.uraian;
  } else {
    document.getElementById('detJurnalStatus').innerText = "⚪ Belum Mengisi Jurnal";
    document.getElementById('detJurnalDivisi').innerText = "-";
    document.getElementById('detJurnalUraian').innerText = "Belum ada catatan jurnal kegiatan untuk tanggal ini.";
  }

  document.getElementById('modalDetailJurnal').classList.remove('hidden');
}

async function loadRekapSholatKalender() {
  if (!currentUser) return;
  const bln = document.getElementById('filterBulanSholat').value;
  const thn = document.getElementById('filterTahunSholat').value;
  
  const res = await callApi("getRekapSholat", { nis: currentUser.nis, bulan: bln, tahun: thn });
  if (res.success) {
    rawSholatMap = res.mapSholat || {};
    renderCalendarSholat(parseInt(bln, 10), parseInt(thn, 10));
  }
}

function renderCalendarSholat(bulan, tahun) {
  const container = document.getElementById('calendarSholatContainer');
  container.innerHTML = `
    <div class="cal-header">Sen</div><div class="cal-header">Sel</div><div class="cal-header">Rab</div>
    <div class="cal-header">Kam</div><div class="cal-header">Jum</div><div class="cal-header">Sab</div>
    <div class="cal-header">Min</div>
  `;
  
  const todayObj = new Date();
  const todayStr = todayObj.getFullYear() + "-" + padZero(todayObj.getMonth() + 1) + "-" + padZero(todayObj.getDate());

  const firstDay = new Date(tahun, bulan - 1, 1).getDay();
  const startingOffset = (firstDay === 0) ? 6 : firstDay - 1;
  const daysInMonth = new Date(tahun, bulan, 0).getDate();

  for (let e = 0; e < startingOffset; e++) { container.innerHTML += `<div class="cal-day empty"></div>`; }
  
  for (let d = 1; d <= daysInMonth; d++) {
    const fullDate = tahun + "-" + padZero(bulan) + "-" + padZero(d);
    let statusClass = "sholat-kosong";
    const isTodayClass = (fullDate === todayStr) ? " today" : "";
    
    if (rawSholatMap[fullDate]) {
      const itemS = rawSholatMap[fullDate];
      const isSubuh = ["✓", "1", true].includes(itemS.subuh);
      const isDzuhur = ["✓", "1", true].includes(itemS.dzuhur);
      const isAshar = ["✓", "1", true].includes(itemS.ashar);
      const isMaghrib = ["✓", "1", true].includes(itemS.maghrib);
      const isIsya = ["✓", "1", true].includes(itemS.isya);

      if (isSubuh && isDzuhur && isAshar && isMaghrib && isIsya) {
        statusClass = "sholat-lengkap";
      } else {
        statusClass = "sholat-parsial";
      }
    }
    
    container.innerHTML += `<div class="cal-day ${statusClass}${isTodayClass}" onclick="openDetailSholatModal('${fullDate}')">${d}</div>`;
  }
}

function openDetailSholatModal(dateStr) {
  document.getElementById('detSholatTgl').innerText = formatHariTanggalIndo(dateStr);
  const itemS = rawSholatMap[dateStr];

  if (itemS) {
    const isSubuh = ["✓", "1", true].includes(itemS.subuh);
    const isDzuhur = ["✓", "1", true].includes(itemS.dzuhur);
    const isAshar = ["✓", "1", true].includes(itemS.ashar);
    const isMaghrib = ["✓", "1", true].includes(itemS.maghrib);
    const isIsya = ["✓", "1", true].includes(itemS.isya);

    if (isSubuh && isDzuhur && isAshar && isMaghrib && isIsya) {
      document.getElementById('detSholatStatus').innerText = "🟢 Sholat Wajib Lengkap 5 Waktu";
    } else {
      document.getElementById('detSholatStatus').innerText = "🟡 Sholat Wajib Belum Lengkap 5 Waktu";
    }
  } else {
    document.getElementById('detSholatStatus').innerText = "⚪ Belum Mengisi Laporan Sholat";
  }

  const sholatGrid = document.getElementById('detSholatGrid');
  sholatGrid.innerHTML = "";
  
  const sholatList = [
    { name: "Subuh", val: itemS ? itemS.subuh : "-" },
    { name: "Dhuha", val: itemS ? itemS.dhuha : "-" },
    { name: "Dzuhur", val: itemS ? itemS.dzuhur : "-" },
    { name: "Asar", val: itemS ? itemS.ashar : "-" },
    { name: "Maghrib", val: itemS ? itemS.maghrib : "-" },
    { name: "Isya'", val: itemS ? itemS.isya : "-" }
  ];

  sholatList.forEach(s => {
    const isChecked = ["✓", "1", true].includes(s.val);
    const badgeCls = isChecked ? "sholat-badge checked" : "sholat-badge";
    const icon = isChecked ? "✓" : "✕";
    sholatGrid.innerHTML += `<div class="${badgeCls}">${s.name}<br><b>${icon}</b></div>`;
  });

  document.getElementById('modalDetailSholat').classList.remove('hidden');
}

// --- AKSI KIRIM DATA (PRESENSI, JURNAL, IZIN, PDF, PIN) ---
async function doCetakPdf() {
  const start = document.getElementById('pdfStart').value;
  const end = document.getElementById('pdfEnd').value;
  
  setButtonLoading('btnCetakPdfJurnal', true, '📄 DOWNLOAD LAPORAN JURNAL', '⏳ Membuat File PDF...');
  const res = await callApi("generatePdfReport", { nis: currentUser.nis, startDate: start, endDate: end });
  setButtonLoading('btnCetakPdfJurnal', false, '📄 DOWNLOAD LAPORAN JURNAL');
  
  if (res.success) {
    const filename = "Jurnal_" + currentUser.nis + "_" + currentUser.nama + ".pdf";
    openOrDownloadPdf(res.pdfBase64, filename);
  } else { showModal('error', 'Gagal Cetak', res.message); }
}

async function doCetakPdfPresensi() {
  const start = document.getElementById('pdfStart').value;
  const end = document.getElementById('pdfEnd').value;
  
  setButtonLoading('btnCetakPdfPresensi', true, '📊 DOWNLOAD REKAP PRESENSI', '⏳ Membuat Rekap PDF...');
  const res = await callApi("generatePdfPresensi", { nis: currentUser.nis, startDate: start, endDate: end });
  setButtonLoading('btnCetakPdfPresensi', false, '📊 DOWNLOAD REKAP PRESENSI');
  
  if (res.success) {
    const cleanKelas = currentUser.kelasAsli || currentUser.kelasKbm || "Kelas";
    const cleanDudika = currentUser.namaDudika || "DUDIKA";
    const customFileName = "Rekap Presensi_" + currentUser.nis + "_" + currentUser.nama + "_" + cleanKelas + "_" + cleanDudika + ".pdf";
    openOrDownloadPdf(res.pdfBase64, customFileName);
  } else { showModal('error', 'Gagal Cetak', res.message); }
}

function openOrDownloadPdf(base64Data, filename) {
  const element = document.createElement('a');
  element.setAttribute('href', 'data:application/pdf;base64,' + base64Data);
  element.setAttribute('download', filename);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

function doPresensiMasuk() {
  if (currentUser && currentUser.statusAkun === "SELESAI") {
    return showModal('warning', 'Akses Dibatasi', 'Masa PKL Anda telah selesai.');
  }

  const fileInput = document.getElementById('fotoMasuk');
  if (fileInput.files.length === 0) return showModal('warning', 'Peringatan', 'Silakan ambil foto bukti presensi dahulu!');
  
  setButtonLoading('btnPresensiMasuk', true, 'CHECK-IN MASUK', '⏳ Mengambil GPS & Foto...');
  navigator.geolocation.getCurrentPosition(async (pos) => {
    compressImage(fileInput.files[0], async (compressedBase64) => {
      const res = await callApi("submitPresensiMasuk", {
        nis: currentUser.nis,
        base64Image: compressedBase64,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      });
      setButtonLoading('btnPresensiMasuk', false, 'CHECK-IN MASUK');
      if (res.success) { 
        showModal('success', 'Berhasil', res.message); 
        updateStatusBanner();
        loadRekapData(); 
      } else { showModal('warning', 'Peringatan', res.message); }
    });
  }, () => { 
    setButtonLoading('btnPresensiMasuk', false, 'CHECK-IN MASUK');
    showModal('error', 'GPS Error', 'Gagal mengambil lokasi GPS. Pastikan GPS HP aktif!'); 
  });
}

function doPresensiPulang() {
  if (currentUser && currentUser.statusAkun === "SELESAI") {
    return showModal('warning', 'Akses Dibatasi', 'Masa PKL Anda telah selesai.');
  }

  setButtonLoading('btnPresensiPulang', true, 'CHECK-OUT PULANG (1-KLIK)', '⏳ Memproses Checkout...');
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const res = await callApi("submitPresensiPulang", {
      nis: currentUser.nis,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude
    });
    setButtonLoading('btnPresensiPulang', false, 'CHECK-OUT PULANG (1-KLIK)');
    if (res.success) { 
      showModal('success', 'Berhasil', res.message); 
      updateStatusBanner();
      loadRekapData(); 
    } else { showModal('warning', 'Peringatan', res.message); }
  }, () => { 
    setButtonLoading('btnPresensiPulang', false, 'CHECK-OUT PULANG (1-KLIK)');
    showModal('error', 'GPS Error', 'Gagal mengambil lokasi GPS. Pastikan GPS HP aktif!'); 
  });
}

function doSubmitIzin() {
  if (currentUser && currentUser.statusAkun === "SELESAI") {
    return showModal('warning', 'Akses Dibatasi', 'Masa PKL Anda telah selesai.');
  }

  const tgl = document.getElementById('izinTanggal').value;
  const status = document.getElementById('izinStatus').value;
  const catatan = document.getElementById('izinCatatan').value;
  const fileInput = document.getElementById('fotoIzin');
  
  if (!tgl || !catatan) return showModal('warning', 'Peringatan', 'Mohon isi tanggal dan catatan!');
  
  setButtonLoading('btnSubmitIzin', true, 'KIRIM PENGAJUAN', '⏳ Mengirim Pengajuan...');
  const processSubmit = async (base64Data) => {
    const res = await callApi("submitIzinSusulan", {
      nis: currentUser.nis,
      tanggal: tgl,
      statusReq: status,
      catatan: catatan,
      base64Foto: base64Data
    });
    setButtonLoading('btnSubmitIzin', false, 'KIRIM PENGAJUAN');
    if (res.success) { 
      showModal('success', 'Berhasil', res.message); 
      document.getElementById('izinCatatan').value = ''; 
      loadRekapData(); 
    } else { 
      showModal('error', 'Gagal', res.message); 
    }
  };

  if (fileInput.files && fileInput.files.length > 0) {
    compressImage(fileInput.files[0], processSubmit);
  } else {
    processSubmit("");
  }
}

async function doSimpanJurnal() {
  if (currentUser && currentUser.statusAkun === "SELESAI") {
    return showModal('warning', 'Akses Dibatasi', 'Masa PKL Anda telah selesai.');
  }

  const tgl = document.getElementById('jurnalTanggal').value;
  const divisi = document.getElementById('jurnalDivisi').value;
  const uraian = document.getElementById('jurnalUraian').value;
  if (!tgl || !divisi || !uraian) return showModal('warning', 'Peringatan', 'Mohon lengkapi seluruh form jurnal!');
  
  setButtonLoading('btnSimpanJurnal', true, 'SIMPAN / UPDATE JURNAL', '⏳ Menyimpan Jurnal...');
  const res = await callApi("submitJurnalKegiatan", { nis: currentUser.nis, tanggal: tgl, divisi, uraian });
  setButtonLoading('btnSimpanJurnal', false, 'SIMPAN / UPDATE JURNAL');
  
  if (res.success) { 
    showModal('success', 'Berhasil', res.message); 
    loadRekapJurnalKalender(); 
  } else showModal('error', 'Peringatan', res.message);
}

async function doSimpanSholat() {
  if (currentUser && currentUser.statusAkun === "SELESAI") {
    return showModal('warning', 'Akses Dibatasi', 'Masa PKL Anda telah selesai.');
  }

  const tgl = document.getElementById('sholatTanggal').value;
  const subuh = document.getElementById('shlSubuh').checked ? "✓" : "-";
  const dhuha = document.getElementById('shlDhuha').checked ? "✓" : "-";
  const dzuhur = document.getElementById('shlDzuhur').checked ? "✓" : "-";
  const ashar = document.getElementById('shlAshar').checked ? "✓" : "-";
  const maghrib = document.getElementById('shlMaghrib').checked ? "✓" : "-";
  const isya = document.getElementById('shlIsya').checked ? "✓" : "-";
  
  setButtonLoading('btnSimpanSholat', true, 'SIMPAN MUTABA\'AH', '⏳ Menyimpan Mutaba\'ah...');
  const res = await callApi("submitJurnalSholat", { nis: currentUser.nis, tanggal: tgl, subuh, dhuha, dzuhur, ashar, maghrib, isya });
  setButtonLoading('btnSimpanSholat', false, 'SIMPAN MUTABA\'AH');
  
  if (res.success) {
    showModal('success', 'Berhasil', res.message);
    loadRekapSholatKalender();
  } else showModal('error', 'Peringatan', res.message);
}

async function doGantiPin() {
  if (currentUser && currentUser.statusAkun === "SELESAI") {
    return showModal('warning', 'Akses Dibatasi', 'Masa PKL Anda telah selesai.');
  }

  const oldPin = document.getElementById('pinLama').value;
  const newPin = document.getElementById('pinBaru').value;
  if (!oldPin || !newPin) return showModal('warning', 'Peringatan', 'Mohon isi PIN Lama dan PIN Baru!');
  
  setButtonLoading('btnGantiPin', true, 'SIMPAN PIN BARU', '⏳ Memproses PIN...');
  const res = await callApi("changePin", { nis: currentUser.nis, pinLama: oldPin, pinBaru: newPin });
  setButtonLoading('btnGantiPin', false, 'SIMPAN PIN BARU');
  
  if (res.success) {
    showModal('success', 'Berhasil', res.message);
    document.getElementById('pinLama').value = '';
    document.getElementById('pinBaru').value = '';
    document.getElementById('gantiPinForm').classList.add('hidden');
  } else { showModal('error', 'Gagal', res.message); }
}

async function updateStatusBanner() {
  if (!currentUser) return;
  const res = await callApi("getStatusPresensiHariIni", { nis: currentUser.nis });
  // Note: di backend fungsi ini menerima param nis langsung, sesuaikan jika dibutuhkan via router.
}

function compressImage(file, callback) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const max_width = 600;
      const scale = max_width / img.width;
      canvas.width = max_width;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      callback(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function formatHariTanggalIndo(dateStr) {
  if (!dateStr) return "-";
  try {
    const parts = dateStr.split("-");
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const namaHari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][d.getDay()];
    const namaBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"][d.getMonth()];
    return namaHari + ", " + d.getDate() + " " + namaBulan + " " + d.getFullYear();
  } catch (e) {
    return dateStr;
  }
}

function switchTab(tabId, el) {
  const contents = document.getElementsByClassName('tab-content');
  for (let i = 0; i < contents.length; i++) contents[i].classList.add('hidden');
  const cards = document.getElementsByClassName('nav-card');
  for (let j = 0; j < cards.length; j++) cards[j].classList.remove('active');
  document.getElementById(tabId).classList.remove('hidden');
  if(el) el.classList.add('active');
}

function toggleGantiPinSection() { document.getElementById('gantiPinForm').classList.toggle('hidden'); }

function doLogout() {
  currentUser = null;
  sessionStorage.removeItem('sippkl_current_user');
  document.getElementById('mainDashboard').classList.add('hidden');
  document.getElementById('userDisplay').classList.add('hidden');
  document.getElementById('loginSection').classList.remove('hidden');
  document.getElementById('loginNis').value = '';
  document.getElementById('loginPin').value = '';
}

function handleFileSelected(input) {
  if (input.files && input.files[0]) {
    const lbl = document.getElementById('btnKameraLabel');
    const info = document.getElementById('infoFileFoto');
    
    lbl.innerHTML = "✅ Foto Berhasil Diambil!";
    lbl.style.borderColor = "#16a34a";
    lbl.style.color = "#15803d";
    info.innerText = "File siap dikirim (sudah dikompres otomatis).";
    
    compressImage(input.files[0], (base64) => {
      document.getElementById('fotoMasukBase64').value = base64;
    });
  }
}
