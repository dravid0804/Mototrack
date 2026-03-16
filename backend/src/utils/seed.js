// src/utils/seed.js — No duplicates, clean catalogue
require('dotenv').config();
const { pool } = require('../config/database');
const logger   = require('../config/logger');

const CATALOGUE = [
  // ── CAR & BIKE (BOTH) ─────────────────────────────────────────────────────
  { vehicle_type:'both', fuel_type:'any',    service_name:'Engine Oil Change',       interval_km:8000,  interval_months:12, default_spec:'10W-40 Semi-Synthetic',  default_qty:'3.5 L', priority:'critical', description:'Engine oil lubricates all moving parts. Old oil causes wear, overheating and engine failure.' },
  { vehicle_type:'both', fuel_type:'any',    service_name:'Air Filter Replacement',  interval_km:15000, interval_months:12, default_spec:'OEM Paper Filter',        default_qty:'1 unit',priority:'high',     description:'Clogged air filter reduces power and fuel economy by up to 15%.' },
  { vehicle_type:'both', fuel_type:'any',    service_name:'Brake Fluid Flush',       interval_km:30000, interval_months:24, default_spec:'DOT 4',                   default_qty:'500 ml',priority:'critical', description:'Brake fluid absorbs moisture — degraded fluid causes brake fade under hard braking.' },
  { vehicle_type:'both', fuel_type:'any',    service_name:'Coolant Flush',           interval_km:40000, interval_months:36, default_spec:'OEM Long Life Coolant',   default_qty:'4 L',   priority:'high',     description:'Old coolant becomes acidic and corrodes engine internals. Prevents overheating.' },
  { vehicle_type:'both', fuel_type:'any',    service_name:'Tyre Pressure Check',     interval_km:500,   interval_months:1,  default_spec:'Per vehicle spec',        default_qty:'—',     priority:'normal',   description:'Correct pressure ensures safety, fuel efficiency and tyre longevity.' },
  { vehicle_type:'both', fuel_type:'any',    service_name:'Battery Check',           interval_km:20000, interval_months:12, default_spec:'N/A',                     default_qty:'—',     priority:'normal',   description:'Weak battery causes no-start. Check terminals and voltage (below 12.4V = attention needed).' },
  { vehicle_type:'both', fuel_type:'petrol', service_name:'Spark Plug Replacement',  interval_km:20000, interval_months:24, default_spec:'NGK Iridium',             default_qty:'4 plugs',priority:'high',    description:'Worn plugs reduce ignition efficiency, fuel economy and cold start reliability.' },

  // ── CAR ONLY ──────────────────────────────────────────────────────────────
  { vehicle_type:'car',  fuel_type:'any',    service_name:'Cabin Air Filter',        interval_km:10000, interval_months:12, default_spec:'Activated Carbon Filter', default_qty:'1 unit',priority:'normal',   description:'Cleans air inside cabin. Clogged filter reduces AC efficiency and air quality.' },
  { vehicle_type:'car',  fuel_type:'any',    service_name:'Tyre Rotation',           interval_km:10000, interval_months:6,  default_spec:'N/A',                     default_qty:'All 4', priority:'normal',   description:'Rotating tyres ensures even wear and extends tyre life significantly.' },
  { vehicle_type:'car',  fuel_type:'any',    service_name:'Wheel Alignment',         interval_km:10000, interval_months:12, default_spec:'N/A',                     default_qty:'—',     priority:'normal',   description:'Misalignment causes uneven tyre wear, pulling and poor fuel economy.' },
  { vehicle_type:'car',  fuel_type:'any',    service_name:'Brake Pad Inspection',    interval_km:20000, interval_months:12, default_spec:'OEM / Brembo',            default_qty:'4 pads',priority:'critical', description:'Worn brake pads reduce stopping ability and damage rotors. Below 3mm is dangerous.' },
  { vehicle_type:'car',  fuel_type:'any',    service_name:'Transmission Oil',        interval_km:40000, interval_months:36, default_spec:'MTF 75W-85 / ATF WS',     default_qty:'2 L',   priority:'high',     description:'Degraded transmission oil causes gearshift issues, clutch wear and slipping.' },
  { vehicle_type:'car',  fuel_type:'diesel', service_name:'Diesel Fuel Filter',      interval_km:20000, interval_months:12, default_spec:'OEM Diesel Filter',       default_qty:'1 unit',priority:'high',     description:'Blocked fuel filter starves injectors causing power loss and hard starting.' },
  { vehicle_type:'car',  fuel_type:'diesel', service_name:'Glow Plug Check',         interval_km:50000, interval_months:48, default_spec:'NGK Glow Plugs',          default_qty:'4 plugs',priority:'high',    description:'Faulty glow plugs cause difficult cold starts and rough idling in diesel engines.' },
  { vehicle_type:'car',  fuel_type:'any',    service_name:'Power Steering Fluid',    interval_km:40000, interval_months:36, default_spec:'OEM PSF',                 default_qty:'500 ml',priority:'normal',   description:'Low or dirty PSF makes steering heavy and can damage the power steering pump.' },
  { vehicle_type:'car',  fuel_type:'any',    service_name:'Differential Oil',        interval_km:40000, interval_months:36, default_spec:'Gear Oil 80W-90',         default_qty:'2.5 L', priority:'normal',   description:'Essential for AWD/4WD and rear-wheel-drive vehicles — change per schedule.' },
  { vehicle_type:'car',  fuel_type:'any',    service_name:'Timing Belt / Chain',     interval_km:60000, interval_months:60, default_spec:'OEM Timing Kit',          default_qty:'1 kit', priority:'critical', description:'CRITICAL — broken timing belt causes catastrophic engine damage. Follow manufacturer schedule.' },
  { vehicle_type:'car',  fuel_type:'any',    service_name:'Wiper Blade Replacement', interval_km:null,  interval_months:12, default_spec:'Bosch AeroTwin / OEM',    default_qty:'2 blades',priority:'low',    description:'Worn wipers streak and reduce visibility in rain. Replace every 12 months.' },
  { vehicle_type:'car',  fuel_type:'any',    service_name:'AC Filter / Service',     interval_km:20000, interval_months:12, default_spec:'AC Refrigerant top-up',   default_qty:'—',     priority:'normal',   description:'AC system check — clean condenser, check refrigerant pressure and cabin filter.' },

  // ── BIKE ONLY ─────────────────────────────────────────────────────────────
  { vehicle_type:'bike', fuel_type:'any',    service_name:'Gear Oil Change',         interval_km:8000,  interval_months:12, default_spec:'Gear Oil 80W-85',         default_qty:'1.1 L', priority:'high',     description:'Separate gear oil on wet-clutch bikes. Ensures smooth shifting and long clutch life.' },
  { vehicle_type:'bike', fuel_type:'any',    service_name:'Chain Lube & Tension',    interval_km:500,   interval_months:1,  default_spec:'O-ring Chain Lube',       default_qty:'1 spray',priority:'high',    description:'Dry or loose chain causes power loss, noise and snap risk. Check every 500 km.' },
  { vehicle_type:'bike', fuel_type:'any',    service_name:'Chain Replacement',       interval_km:20000, interval_months:24, default_spec:'DID / RK Chain 520',      default_qty:'1 chain',priority:'critical', description:'Worn chain stretches, affects power delivery and risks snapping at speed.' },
  { vehicle_type:'bike', fuel_type:'any',    service_name:'Brake Fluid Front',       interval_km:20000, interval_months:24, default_spec:'DOT 4',                   default_qty:'250 ml',priority:'critical', description:'Front brake handles 70% of stopping. Keep fluid fresh for reliable braking performance.' },
  { vehicle_type:'bike', fuel_type:'any',    service_name:'Brake Fluid Rear',        interval_km:20000, interval_months:24, default_spec:'DOT 4',                   default_qty:'150 ml',priority:'high',     description:'Rear brake fluid flush — every 2 years regardless of km.' },
  { vehicle_type:'bike', fuel_type:'any',    service_name:'Fork Oil Change',         interval_km:20000, interval_months:24, default_spec:'Fork Oil 10W',            default_qty:'400 ml',priority:'high',     description:'Old fork oil causes stiff suspension and reduces handling precision and comfort.' },
  { vehicle_type:'bike', fuel_type:'any',    service_name:'Spark Plug (Bike)',       interval_km:10000, interval_months:12, default_spec:'NGK CR7HIX Iridium',      default_qty:'1 plug',priority:'high',     description:'Single-cylinder bikes rely on one plug — replace every 10k for reliable starts.' },
  { vehicle_type:'bike', fuel_type:'any',    service_name:'Clutch Cable Check',      interval_km:5000,  interval_months:6,  default_spec:'N/A',                     default_qty:'—',     priority:'normal',   description:'Fraying clutch cable can snap suddenly. Inspect and lubricate every 5,000 km.' },
  { vehicle_type:'bike', fuel_type:'any',    service_name:'Throttle Cable Check',    interval_km:5000,  interval_months:6,  default_spec:'N/A',                     default_qty:'—',     priority:'normal',   description:'Sticky throttle is a major safety hazard at speed. Lubricate and inspect regularly.' },
  { vehicle_type:'bike', fuel_type:'any',    service_name:'Coolant (Liquid-Cooled)', interval_km:20000, interval_months:24, default_spec:'OEM Coolant 50:50',       default_qty:'1.5 L', priority:'high',     description:'Applies only to liquid-cooled bikes — air-cooled bikes skip. Flush every 2 years.' },
  { vehicle_type:'bike', fuel_type:'any',    service_name:'Brake Pad Inspection',    interval_km:10000, interval_months:12, default_spec:'OEM sintered pads',       default_qty:'2 sets',priority:'critical', description:'Check pad thickness. Below 2mm on a bike is immediately dangerous — replace now.' },
];

async function seed() {
  const client = await pool.connect();
  try {
    logger.info('Seeding service catalogue (no duplicates)…');
    await client.query('DELETE FROM vehicle_service_config');
    await client.query('DELETE FROM service_records WHERE catalogue_id IS NOT NULL');
    await client.query('DELETE FROM service_catalogue');
    for (const svc of CATALOGUE) {
      await client.query(
        `INSERT INTO service_catalogue
           (vehicle_type, fuel_type, service_name, interval_km, interval_months,
            default_spec, default_qty, priority, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [svc.vehicle_type, svc.fuel_type, svc.service_name, svc.interval_km,
         svc.interval_months, svc.default_spec, svc.default_qty, svc.priority, svc.description]
      );
    }
    logger.info(`✅  Seeded ${CATALOGUE.length} clean service entries.`);
  } catch (err) {
    logger.error('Seed failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
