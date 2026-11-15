// DeskKit Studio 3D — parameter schema (UI is generated from this) and presets
const is = (...t) => p => t.includes(p.objectType);

export const OBJECT_TYPES = [
  ['tray', 'Compartment tray'],
  ['pen-cup', 'Pen cup'],
  ['pen-block', 'Stepped pen block'],
  ['phone-stand', 'Phone / tablet stand'],
  ['card-holder', 'Card & note holder'],
  ['cable-organizer', 'Cable dock'],
  ['mini-drawer', 'Mini drawer unit'],
];

export const SCHEMA = [
  { id: 'cup', title: 'Pen cup', open: true, show: is('pen-cup'), params: [
    { key: 'cupShape', label: 'Shape', type: 'select', options: ['round', 'hexagon', 'square', 'octagon', 'flower'], def: 'hexagon' },
    { key: 'cupDiameter', label: 'Diameter (flat-to-flat)', type: 'range', min: 40, max: 140, step: 0.5, def: 78, unit: 'mm' },
    { key: 'cupHeight', label: 'Height', type: 'range', min: 50, max: 180, step: 0.5, def: 105, unit: 'mm' },
    { key: 'cupWall', label: 'Wall thickness', type: 'range', min: 1.2, max: 6, step: 0.1, def: 2.4, unit: 'mm' },
    { key: 'cupFloor', label: 'Floor thickness', type: 'range', min: 1.2, max: 8, step: 0.1, def: 2.4, unit: 'mm' },
    { key: 'cupCorner', label: 'Corner radius', type: 'range', min: 0.6, max: 30, step: 0.5, def: 6, unit: 'mm', show: p => ['hexagon', 'square', 'octagon'].includes(p.cupShape) },
    { key: 'flutes', label: 'Flutes / lobes', type: 'range', min: 0, max: 48, step: 1, def: 0 },
    { key: 'fluteDepth', label: 'Flute depth', type: 'range', min: 0, max: 5, step: 0.1, def: 1.2, unit: 'mm' },
    { key: 'twist', label: 'Twist', type: 'range', min: 0, max: 180, step: 1, def: 30, unit: '°' },
    { key: 'taper', label: 'Top scale (taper)', type: 'range', min: 0.7, max: 1.3, step: 0.01, def: 1.08 },
    { key: 'slant', label: 'Slanted rim', type: 'range', min: 0, max: 40, step: 1, def: 0, unit: '°' },
    { key: 'cupDivider', label: 'Inner divider', type: 'select', options: ['none', 'half', 'cross', 'three-way'], def: 'none' },
    { key: 'cupScoop', label: 'Inside bottom fillet', type: 'range', min: 0, max: 15, step: 0.5, def: 5, unit: 'mm' },
  ] },
  { id: 'tray', title: 'Compartment tray', open: true, show: is('tray'), params: [
    { key: 'trayWidth', label: 'Width', type: 'range', min: 40, max: 300, step: 0.5, def: 200, unit: 'mm' },
    { key: 'trayDepth', label: 'Depth', type: 'range', min: 40, max: 250, step: 0.5, def: 130, unit: 'mm' },
    { key: 'trayHeight', label: 'Height', type: 'range', min: 12, max: 120, step: 0.5, def: 42, unit: 'mm' },
    { key: 'trayWall', label: 'Wall thickness', type: 'range', min: 1.2, max: 6, step: 0.1, def: 2.4, unit: 'mm' },
    { key: 'trayFloor', label: 'Floor thickness', type: 'range', min: 1.2, max: 8, step: 0.1, def: 2.4, unit: 'mm' },
    { key: 'trayCorner', label: 'Outer corner radius', type: 'range', min: 0.5, max: 40, step: 0.5, def: 10, unit: 'mm' },
    { key: 'trayLayout', label: 'Layout', type: 'select', options: ['grid', 'wide-left', 'wide-back', 'trough-front'], def: 'trough-front' },
    { key: 'trayCols', label: 'Columns', type: 'range', min: 1, max: 8, step: 1, def: 3 },
    { key: 'trayRows', label: 'Rows', type: 'range', min: 1, max: 8, step: 1, def: 3 },
    { key: 'trayDivider', label: 'Divider thickness', type: 'range', min: 1, max: 6, step: 0.1, def: 1.8, unit: 'mm' },
    { key: 'trayDividerHeight', label: 'Divider height (1 = full, pockets)', type: 'range', min: 0.3, max: 1, step: 0.05, def: 1 },
    { key: 'trayPocketRadius', label: 'Pocket corner radius', type: 'range', min: 0.6, max: 25, step: 0.5, def: 6, unit: 'mm', show: p => p.trayDividerHeight >= 0.999 },
    { key: 'trayScoop', label: 'Finger scoop (bottom fillet)', type: 'range', min: 0, max: 30, step: 0.5, def: 10, unit: 'mm' },
    { key: 'trayFeet', label: 'Underside recesses', type: 'select', options: ['none', 'rubber feet 10', 'magnets 6x2'], def: 'rubber feet 10' },
  ] },
  { id: 'block', title: 'Stepped pen block', open: true, show: is('pen-block'), params: [
    { key: 'blockTiers', label: 'Tiers', type: 'range', min: 1, max: 4, step: 1, def: 3 },
    { key: 'blockWidth', label: 'Width', type: 'range', min: 50, max: 260, step: 0.5, def: 150, unit: 'mm' },
    { key: 'tierDepth', label: 'Tier depth', type: 'range', min: 20, max: 80, step: 0.5, def: 34, unit: 'mm' },
    { key: 'blockBaseHeight', label: 'Front tier height', type: 'range', min: 20, max: 120, step: 0.5, def: 42, unit: 'mm' },
    { key: 'blockStep', label: 'Step per tier', type: 'range', min: 0, max: 60, step: 0.5, def: 24, unit: 'mm' },
    { key: 'frontTier', label: 'Front tier', type: 'select', options: ['holes', 'tray', 'phone-slot'], def: 'tray' },
    { key: 'holesPerTier', label: 'Holes per tier', type: 'range', min: 1, max: 12, step: 1, def: 6 },
    { key: 'holeDia', label: 'Hole diameter', type: 'range', min: 6, max: 40, step: 0.5, def: 15, unit: 'mm' },
    { key: 'holeDepth', label: 'Hole depth', type: 'range', min: 15, max: 120, step: 0.5, def: 55, unit: 'mm' },
    { key: 'holeRows', label: 'Hole rows', type: 'select', options: ['single', 'staggered'], def: 'single' },
    { key: 'blockCorner', label: 'Corner radius', type: 'range', min: 0.5, max: 25, step: 0.5, def: 8, unit: 'mm' },
    { key: 'blockHollow', label: 'Hollow underside (saves filament)', type: 'check', def: true },
  ] },
  { id: 'stand', title: 'Phone / tablet stand', open: true, show: is('phone-stand'), params: [
    { key: 'device', label: 'Device preview', type: 'select', options: ['phone', 'phone + case', 'tablet', 'tablet + case'], def: 'phone + case' },
    { key: 'deviceThick', label: 'Device thickness (slot)', type: 'range', min: 5, max: 20, step: 0.5, def: 12.5, unit: 'mm' },
    { key: 'standAngle', label: 'Viewing angle', type: 'range', min: 50, max: 80, step: 1, def: 66, unit: '°' },
    { key: 'standWidth', label: 'Width', type: 'range', min: 40, max: 220, step: 0.5, def: 80, unit: 'mm' },
    { key: 'standBaseDepth', label: 'Base depth (min)', type: 'range', min: 40, max: 200, step: 0.5, def: 80, unit: 'mm' },
    { key: 'standBackHeight', label: 'Backrest length', type: 'range', min: 30, max: 200, step: 0.5, def: 85, unit: 'mm' },
    { key: 'standLip', label: 'Front lip height', type: 'range', min: 2, max: 30, step: 0.5, def: 11, unit: 'mm' },
    { key: 'standPlate', label: 'Plate thickness', type: 'range', min: 3, max: 10, step: 0.1, def: 5, unit: 'mm' },
    { key: 'cableNotch', label: 'Cable notch width (0 = none)', type: 'range', min: 0, max: 60, step: 0.5, def: 20, unit: 'mm' },
    { key: 'brace', label: 'Rear brace', type: 'select', options: ['truss', 'solid'], def: 'truss' },
  ] },
  { id: 'card', title: 'Card & note holder', open: true, show: is('card-holder'), params: [
    { key: 'cardType', label: 'Item', type: 'select', options: ['business card', 'sticky note 76', 'index card', 'credit card', 'custom'], def: 'business card' },
    { key: 'cardW', label: 'Custom item width', type: 'range', min: 30, max: 200, step: 0.5, def: 90, unit: 'mm', show: p => p.cardType === 'custom' },
    { key: 'cardH', label: 'Custom item height', type: 'range', min: 30, max: 200, step: 0.5, def: 55, unit: 'mm', show: p => p.cardType === 'custom' },
    { key: 'cardSlots', label: 'Slots', type: 'range', min: 1, max: 5, step: 1, def: 2 },
    { key: 'cardStack', label: 'Stack thickness per slot', type: 'range', min: 3, max: 30, step: 0.5, def: 9, unit: 'mm' },
    { key: 'cardTilt', label: 'Backward tilt', type: 'range', min: 0, max: 30, step: 1, def: 12, unit: '°' },
    { key: 'cardHeightFrac', label: 'Holder height (× item height)', type: 'range', min: 0.25, max: 0.9, step: 0.01, def: 0.55 },
    { key: 'fingerDip', label: 'Front finger dip', type: 'range', min: 0, max: 20, step: 0.5, def: 9, unit: 'mm' },
    { key: 'cardTrough', label: 'Front pen trough', type: 'check', def: true },
    { key: 'cardCorner', label: 'Corner radius', type: 'range', min: 0.5, max: 12, step: 0.5, def: 4, unit: 'mm' },
  ] },
  { id: 'cable', title: 'Cable dock', open: true, show: is('cable-organizer'), params: [
    { key: 'cableChannels', label: 'Channels', type: 'range', min: 1, max: 10, step: 1, def: 5 },
    { key: 'cableDia', label: 'Cable diameter', type: 'range', min: 2, max: 14, step: 0.1, def: 4.5, unit: 'mm' },
    { key: 'cableNeck', label: 'Snap-in neck (× diameter)', type: 'range', min: 0.5, max: 0.95, step: 0.01, def: 0.72 },
    { key: 'cableLength', label: 'Dock length', type: 'range', min: 12, max: 120, step: 0.5, def: 36, unit: 'mm' },
    { key: 'cablePitch', label: 'Gap between channels', type: 'range', min: 2.5, max: 30, step: 0.5, def: 6, unit: 'mm' },
    { key: 'cableBase', label: 'Base thickness', type: 'range', min: 2.4, max: 30, step: 0.1, def: 10, unit: 'mm' },
    { key: 'cableRound', label: 'Top corner radius', type: 'range', min: 0, max: 15, step: 0.5, def: 4, unit: 'mm' },
  ] },
  { id: 'drawer', title: 'Mini drawer unit', open: true, show: is('mini-drawer'), params: [
    { key: 'drawerCount', label: 'Drawers', type: 'range', min: 1, max: 5, step: 1, def: 3 },
    { key: 'drawerW', label: 'Drawer inner width', type: 'range', min: 30, max: 220, step: 0.5, def: 95, unit: 'mm' },
    { key: 'drawerD', label: 'Drawer inner depth', type: 'range', min: 30, max: 220, step: 0.5, def: 115, unit: 'mm' },
    { key: 'drawerH', label: 'Drawer inner height', type: 'range', min: 12, max: 120, step: 0.5, def: 32, unit: 'mm' },
    { key: 'drawerWall', label: 'Drawer wall', type: 'range', min: 1.2, max: 4, step: 0.1, def: 1.6, unit: 'mm' },
    { key: 'caseWall', label: 'Case wall', type: 'range', min: 1.6, max: 6, step: 0.1, def: 2.4, unit: 'mm' },
    { key: 'drawerClear', label: 'Sliding clearance', type: 'range', min: 0.15, max: 1, step: 0.05, def: 0.35, unit: 'mm' },
    { key: 'drawerHandle', label: 'Handle', type: 'select', options: ['tab', 'dip', 'none'], def: 'tab' },
    { key: 'caseCorner', label: 'Case corner radius', type: 'range', min: 0.5, max: 20, step: 0.5, def: 5, unit: 'mm' },
    { key: 'drawerOpen', label: 'Preview: drawers open', type: 'range', min: 0, max: 100, step: 1, def: 35, unit: '%', live: true },
  ] },
  { id: 'finish', title: 'Finish & printability', open: true, params: [
    { key: 'bottomChamfer', label: 'Bottom chamfer (elephant foot)', type: 'range', min: 0, max: 2, step: 0.1, def: 0.6, unit: 'mm' },
    { key: 'topChamfer', label: 'Top edge chamfer', type: 'range', min: 0, max: 2, step: 0.1, def: 0.8, unit: 'mm' },
    { key: 'filament', label: 'Filament', type: 'select', options: ['PLA', 'PETG', 'ABS / ASA', 'Silk PLA', 'Wood PLA'], def: 'PLA' },
    { key: 'infill', label: 'Infill (for weight estimate)', type: 'range', min: 5, max: 100, step: 1, def: 15, unit: '%', live: true },
    { key: 'curveSegs', label: 'Curve resolution', type: 'range', min: 16, max: 128, step: 4, def: 64 },
    { key: 'heightSegs', label: 'Vertical segments (twist)', type: 'range', min: 8, max: 160, step: 4, def: 60 },
  ] },
  { id: 'look', title: 'Colour & scene', open: false, params: [
    { key: 'colorBody', label: 'Body colour', type: 'color', def: '#5fae8f', live: true },
    { key: 'colorAccent', label: 'Interior colour', type: 'color', def: '#e9e3d4', live: true },
    { key: 'twoTone', label: 'Two-tone preview', type: 'check', def: true, live: true },
    { key: 'showRefs', label: 'Fit references (pens, phone, cards…)', type: 'check', def: true, live: true },
    { key: 'roughness', label: 'Roughness', type: 'range', min: 0, max: 1, step: 0.01, def: 0.55, live: true },
    { key: 'sheen', label: 'Satin sheen', type: 'range', min: 0, max: 1, step: 0.01, def: 0.25, live: true },
    { key: 'flatShading', label: 'Flat shading', type: 'check', def: false, live: true },
    { key: 'wireframe', label: 'Wireframe overlay', type: 'check', def: false, live: true },
    { key: 'autoRotate', label: 'Auto-rotate', type: 'check', def: false, live: true },
    { key: 'showGrid', label: 'Desk grid', type: 'check', def: true, live: true },
  ] },
];

export const PARAM_LIST = SCHEMA.flatMap(g => g.params);
export const DEFAULTS = { objectType: 'pen-block', viewMode: 'assembled', ...Object.fromEntries(PARAM_LIST.map(p => [p.key, p.def])) };

const P = o => ({ ...DEFAULTS, ...o });
const tray = o => P({ objectType: 'tray', ...o });
const cup = o => P({ objectType: 'pen-cup', ...o });
const block = o => P({ objectType: 'pen-block', ...o });
const stand = o => P({ objectType: 'phone-stand', ...o });
const card = o => P({ objectType: 'card-holder', ...o });
const cable = o => P({ objectType: 'cable-organizer', ...o });
const drawer = o => P({ objectType: 'mini-drawer', ...o });

// 47 presets, grouped by object type in the UI (order inside a type = order shown)
export const PRESETS = {
  // ---------------------------------------------------------------- stepped pen blocks
  'Stepped Pen Block': block({}),
  'Twin Tier Pen Rack': block({ blockTiers: 2, blockWidth: 120, tierDepth: 30, blockBaseHeight: 50, blockStep: 28, frontTier: 'holes', holesPerTier: 5, holeDia: 14, holeDepth: 45, colorBody: '#e07a5f' }),
  'Marker Station (staggered)': block({ blockTiers: 3, blockWidth: 190, tierDepth: 44, blockBaseHeight: 36, blockStep: 20, frontTier: 'holes', holesPerTier: 9, holeDia: 13, holeRows: 'staggered', holeDepth: 40, colorBody: '#3d5a80' }),
  'Phone Dock Pen Block': block({ blockTiers: 2, blockWidth: 150, tierDepth: 40, blockBaseHeight: 55, blockStep: 30, frontTier: 'phone-slot', holesPerTier: 6, holeDia: 15, colorBody: '#2a9d8f' }),
  'Brush & Pencil Stairs': block({ blockTiers: 4, blockWidth: 170, tierDepth: 26, blockBaseHeight: 30, blockStep: 18, frontTier: 'holes', holesPerTier: 10, holeDia: 10, holeDepth: 40, blockCorner: 5, colorBody: '#f2cc8f' }),
  'Big Marker Block': block({ blockTiers: 1, blockWidth: 120, tierDepth: 62, blockBaseHeight: 75, frontTier: 'holes', holesPerTier: 4, holeDia: 22, holeRows: 'staggered', holeDepth: 60, blockCorner: 12, colorBody: '#264653' }),
  'Desk Tidy XL': block({ blockTiers: 3, blockWidth: 220, tierDepth: 38, blockBaseHeight: 40, blockStep: 26, frontTier: 'tray', holesPerTier: 9, holeDia: 15, colorBody: '#b5838d' }),
  // ---------------------------------------------------------------- trays
  'Bento Tray 3×3': tray({ trayLayout: 'trough-front', trayCols: 3, trayRows: 3, colorBody: '#e2a34f' }),
  'Drawer Insert (low dividers)': tray({ trayWidth: 240, trayDepth: 160, trayHeight: 30, trayLayout: 'wide-left', trayCols: 3, trayRows: 2, trayDividerHeight: 0.7, trayScoop: 6, trayFeet: 'none', colorBody: '#8fa7c7' }),
  'Desk Valet Tray': tray({ trayWidth: 170, trayDepth: 115, trayHeight: 28, trayCorner: 16, trayLayout: 'wide-left', trayCols: 3, trayRows: 2, trayScoop: 12, trayPocketRadius: 8, colorBody: '#c58b5b' }),
  'Jewelry & Ring Tray': tray({ trayWidth: 150, trayDepth: 100, trayHeight: 20, trayWall: 1.8, trayCorner: 8, trayLayout: 'grid', trayCols: 4, trayRows: 3, trayDivider: 1.4, trayPocketRadius: 4, trayScoop: 6, colorBody: '#e8b4b8', colorAccent: '#fff4ee' }),
  'SD & USB Card Tray': tray({ trayWidth: 120, trayDepth: 80, trayHeight: 16, trayWall: 1.8, trayFloor: 1.6, trayCorner: 6, trayLayout: 'grid', trayCols: 6, trayRows: 3, trayDivider: 1.2, trayPocketRadius: 1.5, trayScoop: 3, trayFeet: 'none', colorBody: '#3e4652' }),
  'Screw & Parts Sorter': tray({ trayWidth: 220, trayDepth: 150, trayHeight: 35, trayCorner: 6, trayFloor: 3.4, trayLayout: 'grid', trayCols: 5, trayRows: 4, trayDivider: 1.6, trayPocketRadius: 5, trayScoop: 14, trayFeet: 'magnets 6x2', colorBody: '#f0a030' }),
  'Stationery Organizer': tray({ trayWidth: 240, trayDepth: 120, trayHeight: 45, trayLayout: 'trough-front', trayCols: 4, trayRows: 2, colorBody: '#7aa6c2' }),
  'Key & Coin Catch-all': tray({ trayWidth: 120, trayDepth: 120, trayHeight: 25, trayCorner: 28, trayLayout: 'grid', trayCols: 1, trayRows: 1, trayScoop: 18, trayPocketRadius: 25, colorBody: '#2f6f5e', colorAccent: '#d9c9a3' }),
  'Gridded Drawer Liner': tray({ trayWidth: 290, trayDepth: 210, trayHeight: 24, trayWall: 1.8, trayCorner: 6, trayLayout: 'wide-back', trayCols: 5, trayRows: 3, trayDividerHeight: 0.5, trayScoop: 4, trayFeet: 'none', colorBody: '#d8d2c4', colorAccent: '#a3b18a' }),
  'Tea Bag Box (open)': tray({ trayWidth: 180, trayDepth: 90, trayHeight: 75, trayCorner: 8, trayLayout: 'grid', trayCols: 3, trayRows: 1, trayPocketRadius: 4, trayScoop: 4, colorBody: '#606c38', colorAccent: '#fefae0' }),
  // ---------------------------------------------------------------- pen cups
  'Twisted Hex Pen Cup': cup({ cupShape: 'hexagon', twist: 60, taper: 1.1, colorBody: '#d36d5a' }),
  'Fluted Round Cup': cup({ cupShape: 'round', cupDiameter: 82, flutes: 28, fluteDepth: 1.6, twist: 0, taper: 1.04, cupDivider: 'cross', colorBody: '#c9b48a' }),
  'Slanted Flower Cup': cup({ cupShape: 'flower', flutes: 9, fluteDepth: 4, cupDiameter: 86, twist: 40, slant: 18, taper: 1.0, colorBody: '#b07cc6' }),
  'Minimal Square Cup': cup({ cupShape: 'square', cupDiameter: 75, cupHeight: 100, cupCorner: 12, twist: 0, taper: 1.0, colorBody: '#ececec', colorAccent: '#5fae8f' }),
  'Spiral Octagon Cup': cup({ cupShape: 'octagon', cupDiameter: 80, cupHeight: 120, cupCorner: 4, twist: 120, taper: 1.15, heightSegs: 120, colorBody: '#2e86ab' }),
  'Wide Brush Holder': cup({ cupShape: 'round', cupDiameter: 105, cupHeight: 120, flutes: 36, fluteDepth: 1.0, twist: 0, taper: 1.02, cupDivider: 'cross', colorBody: '#8d6e63' }),
  'Tapered Cone Cup': cup({ cupShape: 'round', cupDiameter: 66, cupHeight: 110, flutes: 0, twist: 0, taper: 1.3, colorBody: '#ff8a5c' }),
  'Petal Cup (small)': cup({ cupShape: 'flower', flutes: 6, fluteDepth: 4.5, cupDiameter: 62, cupHeight: 78, twist: 60, taper: 1.06, colorBody: '#f4a6c1' }),
  'Three-Way Tool Cup': cup({ cupShape: 'hexagon', cupDiameter: 96, cupHeight: 115, twist: 0, taper: 1.0, slant: 15, cupDivider: 'three-way', colorBody: '#596475' }),
  'Ribbed Toothbrush Cup': cup({ cupShape: 'round', cupDiameter: 72, cupHeight: 105, flutes: 40, fluteDepth: 0.8, twist: 25, taper: 0.92, cupDivider: 'half', colorBody: '#9ad1d4' }),
  // ---------------------------------------------------------------- stands
  'Phone Stand': stand({}),
  'Tablet Stand': stand({ device: 'tablet + case', deviceThick: 14, standAngle: 62, standWidth: 150, standBaseDepth: 110, standBackHeight: 120, standLip: 13, standPlate: 6, cableNotch: 30, colorBody: '#5c7fa3' }),
  'Low-Angle Reading Stand': stand({ device: 'tablet', deviceThick: 9, standAngle: 55, standWidth: 180, standBaseDepth: 130, standBackHeight: 110, standLip: 10, standPlate: 6, cableNotch: 0, colorBody: '#a98467' }),
  'Nightstand Phone Dock': stand({ device: 'phone', deviceThick: 10, standAngle: 72, standWidth: 70, standBaseDepth: 75, standBackHeight: 80, standLip: 8, cableNotch: 18, brace: 'solid', colorBody: '#22223b' }),
  'Dual Phone Stand': stand({ device: 'phone + case', deviceThick: 13, standAngle: 66, standWidth: 190, standBaseDepth: 85, standBackHeight: 95, standLip: 12, cableNotch: 0, colorBody: '#ef476f' }),
  'E-reader Stand': stand({ device: 'phone', deviceThick: 9.5, standAngle: 63, standWidth: 110, standBaseDepth: 90, standBackHeight: 105, standLip: 9, cableNotch: 0, colorBody: '#6b9080' }),
  'Video-Call Stand (steep)': stand({ device: 'phone + case', deviceThick: 12.5, standAngle: 78, standWidth: 75, standBaseDepth: 95, standBackHeight: 110, standLip: 14, cableNotch: 22, colorBody: '#118ab2' }),
  // ---------------------------------------------------------------- card / note holders
  'Business Card Holder': card({ colorBody: '#3e4652' }),
  'Sticky Note Station': card({ cardType: 'sticky note 76', cardSlots: 1, cardStack: 22, cardTilt: 8, cardHeightFrac: 0.4, cardTrough: true, colorBody: '#f0c24b' }),
  'Index Card File': card({ cardType: 'index card', cardSlots: 3, cardStack: 14, cardTilt: 6, cardHeightFrac: 0.6, cardTrough: false, fingerDip: 12, colorBody: '#7f5539' }),
  'Credit Card Rack': card({ cardType: 'credit card', cardSlots: 4, cardStack: 5, cardTilt: 15, cardHeightFrac: 0.5, cardTrough: false, fingerDip: 8, colorBody: '#1d3557' }),
  'Photo / Postcard Display': card({ cardType: 'custom', cardW: 150, cardH: 100, cardSlots: 1, cardStack: 4, cardTilt: 18, cardHeightFrac: 0.25, cardTrough: false, fingerDip: 0, colorBody: '#fefae0', colorAccent: '#bc6c25' }),
  'Coaster Holder': card({ cardType: 'custom', cardW: 100, cardH: 100, cardSlots: 1, cardStack: 30, cardTilt: 0, cardHeightFrac: 0.45, cardTrough: false, fingerDip: 16, cardCorner: 4, colorBody: '#8a5a44' }),
  'Recipe Card Stand': card({ cardType: 'custom', cardW: 127, cardH: 102, cardSlots: 2, cardStack: 10, cardTilt: 12, cardHeightFrac: 0.4, cardTrough: true, colorBody: '#e76f51' }),
  // ---------------------------------------------------------------- cable docks
  'Cable Dock ×5': cable({ colorBody: '#4a4f57' }),
  'Charging Cable Trio': cable({ cableChannels: 3, cableDia: 4, cableNeck: 0.75, cableLength: 30, cablePitch: 7, cableBase: 12, cableRound: 5, colorBody: '#f4f1de' }),
  'Thick Power Cable Holder': cable({ cableChannels: 3, cableDia: 10, cableNeck: 0.7, cableLength: 40, cablePitch: 8, cableBase: 12, cableRound: 6, colorBody: '#3a3a3a' }),
  'Earphone Cable Clip': cable({ cableChannels: 2, cableDia: 2.5, cableNeck: 0.7, cableLength: 16, cablePitch: 4, cableBase: 5, cableRound: 3, colorBody: '#ffb703' }),
  'Desk Cable Bar ×8': cable({ cableChannels: 8, cableDia: 5, cableNeck: 0.72, cableLength: 50, cablePitch: 5, cableBase: 10, cableRound: 4, colorBody: '#5fae8f' }),
  'HDMI & USB Mix ×4': cable({ cableChannels: 4, cableDia: 7.5, cableNeck: 0.68, cableLength: 36, cablePitch: 6, cableBase: 10, colorBody: '#457b9d' }),
  // ---------------------------------------------------------------- mini drawers
  'Mini Drawers ×3': drawer({ colorBody: '#e7e2d6', colorAccent: '#5fae8f' }),
  'Single Stationery Drawer': drawer({ drawerCount: 1, drawerW: 180, drawerD: 150, drawerH: 45, caseWall: 2.8, caseCorner: 6, colorBody: '#2b2d42', colorAccent: '#edf2f4' }),
  'Tall Drawer Tower ×5': drawer({ drawerCount: 5, drawerW: 80, drawerD: 110, drawerH: 25, drawerHandle: 'dip', caseCorner: 4, colorBody: '#cdb4db', colorAccent: '#ffffff' }),
  'SD Card Drawers ×4': drawer({ drawerCount: 4, drawerW: 60, drawerD: 80, drawerH: 18, drawerWall: 1.4, caseWall: 2, caseCorner: 3, colorBody: '#264653', colorAccent: '#e9c46a' }),
  'Wide Drawer Pair': drawer({ drawerCount: 2, drawerW: 200, drawerD: 160, drawerH: 40, caseWall: 3, caseCorner: 8, colorBody: '#f1faee', colorAccent: '#e63946' }),
  'Craft Supply Drawers ×3': drawer({ drawerCount: 3, drawerW: 120, drawerD: 130, drawerH: 55, drawerWall: 2, caseWall: 2.8, colorBody: '#ffafcc', colorAccent: '#bde0fe' }),
};

export const PRESET_GROUPS = OBJECT_TYPES.map(([type, label]) => [label, Object.keys(PRESETS).filter(k => PRESETS[k].objectType === type)]);
