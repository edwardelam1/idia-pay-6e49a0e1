import { lazy, ComponentType } from 'react';

/**
 * IDIA LiquidOS: Autonomic Discovery Engine
 * This automatically maps Hub IDs to physical files.
 * NO MANUAL REGISTRATION REQUIRED.
 */

// 1. Capture all Nano-Bite files in the nanobites directory
// The keys will be paths like: "../../components/nanobites/hospitality/OrderEntryBite.tsx"
const BITE_FILES = import.meta.glob('../../components/nanobites/**/*.tsx');

/**
 * Normalizes a Hub ID into a probable file path.
 * Logic: 'nb-hosp-food-truck-order' -> 'hospitality/FoodTruckOrder'
 */
const idToPath = (id: string): string => {
  const parts = id.split('-'); // ['nb', 'hosp', 'food', 'truck', 'order']
  const vertical = parts[1] === 'hosp' ? 'hospitality' : parts[1]; // Expand shorthands
  const fileName = parts.slice(2)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(''); // CamelCase: 'FoodTruckOrder'
  
  return `${vertical}/${fileName}`;
};

export const resolveLegoComponent = (id: string): ComponentType<any> | null => {
  console.log(`[AUTONOMIC_DISCOVERY]: START - Resolving ID: ${id}`);
  
  const targetPath = idToPath(id);
  
  // Find the file in the globbed modules
  const match = Object.keys(BITE_FILES).find(path => 
    path.includes(`${targetPath}.tsx`)
  );

  if (!match) {
    console.error(`[AUTONOMIC_DISCOVERY]: ERROR - No physical file found for path fragment: ${targetPath}`);
    return null;
  }

  console.log(`[AUTONOMIC_DISCOVERY]: END - Successfully discovered ${match}`);
  return lazy(BITE_FILES[match] as () => Promise<{ default: ComponentType<any> }>);
};