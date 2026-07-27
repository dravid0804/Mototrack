// js/vehicle-data.js — make/model catalogue used only on the Add Vehicle page
'use strict';

const MAKES_BY_TYPE = {
  car: ['Hyundai','Toyota','Honda','Maruti Suzuki','Tata','Mahindra','Kia','MG','Volkswagen','Skoda','Ford','Renault'],
  bike: ['Royal Enfield','Honda','Yamaha','Bajaj','TVS','Hero','KTM','Suzuki','Kawasaki','Triumph'],
  tractor: ['Mahindra','Swaraj','Sonalika','TAFE','Massey Ferguson','Eicher','John Deere','New Holland','Powertrac','Farmtrac'],
};

const MODELS_BY_MAKE = {
  'car|Hyundai': ['Grand i10 Nios','i20','Verna','Venue','Creta','Alcazar','Exter','Tucson'],
  'car|Toyota': ['Glanza','Urban Cruiser Hyryder','Innova Crysta','Fortuner','Camry','Rumion'],
  'car|Honda': ['Amaze','City','Elevate','WR-V'],
  'car|Maruti Suzuki': ['Alto K10','Swift','Baleno','Dzire','WagonR','Brezza','Ertiga','Grand Vitara'],
  'car|Tata': ['Tiago','Tigor','Altroz','Punch','Nexon','Harrier','Safari'],
  'car|Mahindra': ['Bolero','Scorpio-N','XUV300','XUV700','Thar','Marazzo'],
  'car|Kia': ['Sonet','Seltos','Carens','Carnival'],
  'car|MG': ['Astor','Hector','ZS EV','Comet EV'],
  'car|Volkswagen': ['Polo','Virtus','Taigun'],
  'car|Skoda': ['Slavia','Kushaq','Kodiaq'],
  'car|Ford': ['EcoSport','Endeavour','Figo'],
  'car|Renault': ['Kwid','Triber','Kiger'],

  'bike|Royal Enfield': ['Classic 350','Bullet 350','Hunter 350','Meteor 350','Himalayan','Continental GT 650'],
  'bike|Honda': ['Activa 6G','Shine','Unicorn','SP125','CB350','Hornet 2.0'],
  'bike|Yamaha': ['FZ-S','R15','MT-15','Fascino','Ray ZR'],
  'bike|Bajaj': ['Pulsar 150','Pulsar NS200','Platina','CT100','Dominar 400','Avenger'],
  'bike|TVS': ['Apache RTR 160','Jupiter','Ntorq 125','Raider 125','Sport'],
  'bike|Hero': ['Splendor Plus','HF Deluxe','Passion Pro','Glamour','Xtreme 160R'],
  'bike|KTM': ['Duke 200','Duke 390','RC 200','RC 390'],
  'bike|Suzuki': ['Access 125','Gixxer','Gixxer SF','Burgman Street'],
  'bike|Kawasaki': ['Ninja 300','Ninja 650','Z650'],
  'bike|Triumph': ['Speed 400','Scrambler 400X'],

  'tractor|Mahindra': ['265 DI','475 DI','575 DI','585 DI','Jivo 245'],
  'tractor|Swaraj': ['724 XT','735 FE','744 FE','855 FE'],
  'tractor|Sonalika': ['DI 745 III','DI 750 III','DI 60'],
  'tractor|TAFE': ['TAFE 45 DI','TAFE 5900'],
  'tractor|Massey Ferguson': ['MF 241 DI','MF 1035 DI','MF 9500'],
  'tractor|Eicher': ['Eicher 380','Eicher 485','Eicher 551'],
  'tractor|John Deere': ['5050 D','5310','5210'],
  'tractor|New Holland': ['3630 TX','3600-2 TX Plus'],
  'tractor|Powertrac': ['Euro 50','434 Plus'],
  'tractor|Farmtrac': ['45 Smart','60 Powermaxx'],
};

function populateMakeOptions(type) {
  const makes = MAKES_BY_TYPE[type] || [];
  const sel = $('av_make');
  if (!sel) return;
  sel.innerHTML = '<option value="">Select make</option>' + makes.map(m => `<option value="${m}">${m}</option>`).join('');
  populateModelOptions();
}

function populateModelOptions() {
  const type = document.querySelector('#vtRow .vt-b.sel')?.dataset.type || 'car';
  const make = $('av_make')?.value || '';
  const modelSel = $('av_model_select');
  const modelInput = $('av_model');
  if (!modelSel || !modelInput) return;

  const models = MODELS_BY_MAKE[`${type}|${make}`] || [];

  if (!make) {
    modelSel.innerHTML = '<option value="">Select make first</option>';
    modelSel.disabled = true;
  } else {
    modelSel.disabled = false;
    modelSel.innerHTML = '<option value="">Select model</option>' +
      models.map(m => `<option value="${m}">${m}</option>`).join('') +
      '<option value="__other__">Other (type manually)</option>';
  }
  modelInput.style.display = 'none';
  modelInput.value = '';
  handleModelSelect();
}

function handleModelSelect() {
  const modelSel = $('av_model_select');
  const modelInput = $('av_model');
  if (!modelSel || !modelInput) return;
  if (modelSel.value === '__other__') {
    modelInput.style.display = 'block';
    modelInput.focus();
  } else {
    modelInput.style.display = 'none';
    modelInput.value = modelSel.value;
  }
}

function selVT(el) {
  el.closest('.vt-row').querySelectorAll('.vt-b').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
  populateMakeOptions(el.dataset.type);
}
