// src/utils/seed.js - fuel-aware service catalogue
require('dotenv').config();
const { pool } = require('../config/database');
const logger = require('../config/logger');

const CATALOGUE = [
  // Universal safety checks
  { vehicle_type:'all', fuel_type:'any', service_name:'Tyre Pressure', interval_km:500, interval_months:1, default_spec:'As per vehicle label', default_qty:'All tyres', priority:'normal', description:'Keeps grip, braking and tyre life in good condition.' },
  { vehicle_type:'all', fuel_type:'any', service_name:'Brake Check', interval_km:10000, interval_months:12, default_spec:'Pads, shoes, discs and drums', default_qty:'Full set check', priority:'critical', description:'Checks braking parts before they become unsafe.' },
  { vehicle_type:'all', fuel_type:'any', service_name:'Brake Fluid', interval_km:30000, interval_months:24, default_spec:'DOT 4 or OEM spec', default_qty:'As required', priority:'critical', description:'Old brake fluid absorbs moisture and reduces braking performance.' },
  { vehicle_type:'all', fuel_type:'any', service_name:'Battery Check', interval_km:10000, interval_months:6, default_spec:'12V battery and terminals', default_qty:'1 battery', priority:'normal', description:'Prevents weak starts and electrical faults.' },
  { vehicle_type:'all', fuel_type:'any', service_name:'Lights and Horn', interval_km:5000, interval_months:6, default_spec:'All bulbs, indicators and horn', default_qty:'Full check', priority:'normal', description:'Basic safety check for night driving and road use.' },

  // Combustion engine basics
  { vehicle_type:'both', fuel_type:'ice', service_name:'Engine Oil', interval_km:8000, interval_months:12, default_spec:'Manufacturer recommended oil', default_qty:'As per engine', priority:'critical', description:'Fresh oil protects engine parts from wear and overheating.' },
  { vehicle_type:'both', fuel_type:'ice', service_name:'Engine Air Filter', interval_km:15000, interval_months:12, default_spec:'OEM air filter', default_qty:'1 filter', priority:'high', description:'A clean air filter improves pickup, mileage and engine life.' },
  { vehicle_type:'both', fuel_type:'ice', service_name:'Coolant', interval_km:40000, interval_months:36, default_spec:'OEM coolant', default_qty:'As required', priority:'high', description:'Prevents overheating and corrosion in liquid-cooled engines.' },
  { vehicle_type:'both', fuel_type:'petrol', service_name:'Spark Plug', interval_km:20000, interval_months:24, default_spec:'OEM or NGK plug', default_qty:'As per engine', priority:'high', description:'Good spark plugs improve starting, pickup and mileage.' },
  { vehicle_type:'both', fuel_type:'cng', service_name:'Spark Plug', interval_km:15000, interval_months:18, default_spec:'CNG compatible plug', default_qty:'As per engine', priority:'high', description:'CNG engines need healthy spark plugs for smooth running.' },
  { vehicle_type:'both', fuel_type:'diesel', service_name:'Fuel Filter', interval_km:20000, interval_months:12, default_spec:'OEM diesel filter', default_qty:'1 filter', priority:'high', description:'Protects diesel injectors from dirt and water.' },
  { vehicle_type:'both', fuel_type:'cng', service_name:'CNG Filter', interval_km:20000, interval_months:12, default_spec:'CNG low/high pressure filter', default_qty:'As fitted', priority:'high', description:'Keeps the CNG kit clean and prevents poor running.' },

  // Cars
  { vehicle_type:'car', fuel_type:'any', service_name:'Cabin Air Filter', interval_km:10000, interval_months:12, default_spec:'Cabin AC filter', default_qty:'1 filter', priority:'normal', description:'Keeps cabin air cleaner and helps AC airflow.' },
  { vehicle_type:'car', fuel_type:'any', service_name:'Tyre Rotation', interval_km:10000, interval_months:6, default_spec:'Rotate all tyres', default_qty:'All tyres', priority:'normal', description:'Helps tyres wear evenly.' },
  { vehicle_type:'car', fuel_type:'any', service_name:'Wheel Alignment', interval_km:10000, interval_months:12, default_spec:'Alignment and balancing', default_qty:'Full check', priority:'normal', description:'Prevents pulling and uneven tyre wear.' },
  { vehicle_type:'car', fuel_type:'ice', service_name:'Transmission Oil', interval_km:40000, interval_months:36, default_spec:'MTF or ATF as required', default_qty:'As per gearbox', priority:'high', description:'Keeps gear shifts smooth and protects the gearbox.' },
  { vehicle_type:'car', fuel_type:'ice', service_name:'Timing Belt or Chain', interval_km:60000, interval_months:60, default_spec:'OEM timing kit', default_qty:'1 kit', priority:'critical', description:'A failed timing belt can badly damage the engine.' },
  { vehicle_type:'car', fuel_type:'ice', service_name:'Power Steering Fluid', interval_km:40000, interval_months:36, default_spec:'OEM steering fluid', default_qty:'As required', priority:'normal', description:'Prevents heavy steering and pump damage where fitted.' },
  { vehicle_type:'car', fuel_type:'any', service_name:'Wiper Blades', interval_km:null, interval_months:12, default_spec:'Correct blade size', default_qty:'Front pair', priority:'low', description:'Improves visibility in rain.' },
  { vehicle_type:'car', fuel_type:'any', service_name:'AC Service', interval_km:20000, interval_months:12, default_spec:'Cooling and leak check', default_qty:'As required', priority:'normal', description:'Keeps cabin cooling effective.' },
  { vehicle_type:'car', fuel_type:'electric', service_name:'EV Battery Health', interval_km:20000, interval_months:12, default_spec:'Battery scan and SOH check', default_qty:'1 scan', priority:'critical', description:'Checks high-voltage battery health and charging behaviour.' },
  { vehicle_type:'car', fuel_type:'electric', service_name:'Charging Port', interval_km:10000, interval_months:12, default_spec:'Port, pins and flap check', default_qty:'1 check', priority:'high', description:'Prevents charging issues from dirt, heat or loose pins.' },
  { vehicle_type:'car', fuel_type:'electric', service_name:'Motor and Inverter', interval_km:30000, interval_months:24, default_spec:'Diagnostic scan', default_qty:'1 scan', priority:'high', description:'Checks drive motor and inverter fault codes.' },
  { vehicle_type:'car', fuel_type:'electric', service_name:'Battery Coolant', interval_km:40000, interval_months:36, default_spec:'EV coolant', default_qty:'As required', priority:'high', description:'Keeps the battery and power electronics at safe temperature.' },
  { vehicle_type:'car', fuel_type:'hybrid', service_name:'Hybrid Battery Health', interval_km:20000, interval_months:12, default_spec:'Hybrid battery scan', default_qty:'1 scan', priority:'high', description:'Checks hybrid battery condition and charging performance.' },

  // Bikes, including rare diesel bikes
  { vehicle_type:'bike', fuel_type:'ice', service_name:'Chain Lube and Slack', interval_km:500, interval_months:1, default_spec:'Chain lube and slack check', default_qty:'1 service', priority:'high', description:'Prevents chain wear, noise and snap risk.' },
  { vehicle_type:'bike', fuel_type:'ice', service_name:'Chain Sprocket Set', interval_km:20000, interval_months:24, default_spec:'Chain and sprockets', default_qty:'1 set', priority:'critical', description:'Replace worn chain and sprockets together.' },
  { vehicle_type:'bike', fuel_type:'ice', service_name:'Fork Oil', interval_km:20000, interval_months:24, default_spec:'Fork oil as per model', default_qty:'As required', priority:'high', description:'Keeps front suspension smooth and stable.' },
  { vehicle_type:'bike', fuel_type:'ice', service_name:'Clutch Cable', interval_km:5000, interval_months:6, default_spec:'Cable inspection and lube', default_qty:'1 cable check', priority:'normal', description:'Prevents sudden clutch cable failure.' },
  { vehicle_type:'bike', fuel_type:'ice', service_name:'Throttle Cable', interval_km:5000, interval_months:6, default_spec:'Cable inspection and lube', default_qty:'1 cable check', priority:'normal', description:'Keeps throttle movement smooth and safe.' },
  { vehicle_type:'bike', fuel_type:'electric', service_name:'EV Battery Health', interval_km:10000, interval_months:12, default_spec:'Battery SOH check', default_qty:'1 scan', priority:'critical', description:'Checks battery range, health and charging behaviour.' },
  { vehicle_type:'bike', fuel_type:'electric', service_name:'Motor Controller', interval_km:15000, interval_months:12, default_spec:'Controller and wiring scan', default_qty:'1 check', priority:'high', description:'Checks controller, wiring and fault codes.' },
  { vehicle_type:'bike', fuel_type:'electric', service_name:'Charging Port', interval_km:5000, interval_months:6, default_spec:'Port and charger check', default_qty:'1 check', priority:'high', description:'Prevents charging failures from loose or dirty connectors.' },
  { vehicle_type:'bike', fuel_type:'electric', service_name:'Belt or Chain Drive', interval_km:5000, interval_months:6, default_spec:'Drive belt or chain check', default_qty:'1 check', priority:'normal', description:'Checks final drive tension and wear.' },

  // Indian tractors
  { vehicle_type:'tractor', fuel_type:'ice', service_name:'Engine Oil', interval_km:250, interval_months:6, default_spec:'15W-40 diesel engine oil', default_qty:'As per tractor', priority:'critical', description:'Essential for diesel tractor engines working under heavy load.' },
  { vehicle_type:'tractor', fuel_type:'ice', service_name:'Engine Air Filter', interval_km:250, interval_months:3, default_spec:'Dry or oil bath filter', default_qty:'1 service', priority:'critical', description:'Dusty field work blocks filters quickly and damages engines.' },
  { vehicle_type:'tractor', fuel_type:'diesel', service_name:'Diesel Fuel Filter', interval_km:500, interval_months:6, default_spec:'Primary and secondary filters', default_qty:'Set', priority:'high', description:'Protects pump and injectors from dirt and water.' },
  { vehicle_type:'tractor', fuel_type:'ice', service_name:'Radiator Coolant', interval_km:1000, interval_months:12, default_spec:'Coolant and radiator flush', default_qty:'As required', priority:'high', description:'Prevents overheating during ploughing and transport.' },
  { vehicle_type:'tractor', fuel_type:'any', service_name:'Hydraulic Oil', interval_km:1000, interval_months:12, default_spec:'UTTO or OEM hydraulic oil', default_qty:'As per tractor', priority:'critical', description:'Keeps lift arms, steering and implements working smoothly.' },
  { vehicle_type:'tractor', fuel_type:'any', service_name:'Hydraulic Filter', interval_km:500, interval_months:12, default_spec:'OEM hydraulic filter', default_qty:'1 filter', priority:'high', description:'Protects hydraulic pump and lift system.' },
  { vehicle_type:'tractor', fuel_type:'any', service_name:'Transmission Oil', interval_km:1000, interval_months:12, default_spec:'Gear oil or UTTO', default_qty:'As per gearbox', priority:'high', description:'Protects gearbox and rear axle under load.' },
  { vehicle_type:'tractor', fuel_type:'any', service_name:'Grease Points', interval_km:50, interval_months:1, default_spec:'Chassis grease', default_qty:'All nipples', priority:'normal', description:'Grease front axle, steering joints, linkages and pedal pivots.' },
  { vehicle_type:'tractor', fuel_type:'any', service_name:'Clutch and Brake Adjustment', interval_km:250, interval_months:6, default_spec:'Free play adjustment', default_qty:'1 check', priority:'high', description:'Important for safe field and road operation.' },
  { vehicle_type:'tractor', fuel_type:'any', service_name:'PTO and Hitch Check', interval_km:250, interval_months:6, default_spec:'PTO shaft, linkage and hitch pins', default_qty:'1 check', priority:'high', description:'Keeps implements safe and properly connected.' },
  { vehicle_type:'tractor', fuel_type:'electric', service_name:'EV Battery Health', interval_km:250, interval_months:6, default_spec:'Traction battery scan', default_qty:'1 scan', priority:'critical', description:'Checks battery health for electric tractors.' },
  { vehicle_type:'tractor', fuel_type:'electric', service_name:'Motor and Controller', interval_km:500, interval_months:12, default_spec:'Motor controller diagnostic', default_qty:'1 scan', priority:'high', description:'Checks electric drive faults and wiring condition.' },
  { vehicle_type:'tractor', fuel_type:'electric', service_name:'Charging Port', interval_km:250, interval_months:6, default_spec:'Port and cable inspection', default_qty:'1 check', priority:'high', description:'Prevents charging issues in dusty farm conditions.' },
];

async function seed() {
  const client = await pool.connect();
  try {
    logger.info('Seeding fuel-aware service catalogue...');
    await client.query('BEGIN');

    await client.query("UPDATE service_catalogue SET fuel_type='legacy_' || substring(id::text, 1, 8) WHERE fuel_type NOT LIKE 'legacy_%'");

    for (const svc of CATALOGUE) {
      await client.query(
        `INSERT INTO service_catalogue
           (vehicle_type, fuel_type, service_name, interval_km, interval_months,
            default_spec, default_qty, priority, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (vehicle_type, fuel_type, service_name) DO UPDATE SET
           interval_km=EXCLUDED.interval_km,
           interval_months=EXCLUDED.interval_months,
           default_spec=EXCLUDED.default_spec,
           default_qty=EXCLUDED.default_qty,
           priority=EXCLUDED.priority,
           description=EXCLUDED.description`,
        [svc.vehicle_type, svc.fuel_type, svc.service_name, svc.interval_km,
         svc.interval_months, svc.default_spec, svc.default_qty, svc.priority, svc.description]
      );
    }

    await client.query('DELETE FROM vehicle_service_config');
    await client.query(`
      INSERT INTO vehicle_service_config (vehicle_id, catalogue_id)
      SELECT v.id, sc.id
      FROM vehicles v
      JOIN service_catalogue sc
        ON (sc.vehicle_type = v.type OR sc.vehicle_type = 'all' OR (sc.vehicle_type = 'both' AND v.type IN ('car','bike')))
       AND (sc.fuel_type = 'any' OR sc.fuel_type = v.fuel_type OR (sc.fuel_type = 'ice' AND v.fuel_type IN ('petrol','diesel','cng','hybrid')))
      WHERE v.is_active = TRUE
      ON CONFLICT DO NOTHING
    `);

    await client.query('COMMIT');
    logger.info(`Seeded ${CATALOGUE.length} fuel-aware service entries.`);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Seed failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
