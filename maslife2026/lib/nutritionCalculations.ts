// Fórmulas clínicas de nutrición — usadas en ClinicalRecord.tsx

export type ActivityLevel = 'sedentario' | 'ligero' | 'moderado' | 'activo' | 'muyActivo';
export type Gender = 'Masculino' | 'Femenino';

export const ACTIVITY_FACTORS: Record<ActivityLevel, { label: string; factor: number }> = {
  sedentario:  { label: 'Sedentario (sin ejercicio)',           factor: 1.2   },
  ligero:      { label: 'Ligero (1-3 días/semana)',             factor: 1.375 },
  moderado:    { label: 'Moderado (3-5 días/semana)',           factor: 1.55  },
  activo:      { label: 'Activo (6-7 días/semana)',             factor: 1.725 },
  muyActivo:   { label: 'Muy activo (doble jornada / atleta)',  factor: 1.9   },
};

// ── Índice de Masa Corporal ──────────────────────────────────────────────────
export function calcBMI(weightKg: number, heightCm: number): number {
  const h = heightCm / 100;
  return weightKg / (h * h);
}

export function classifyBMI(bmi: number): { label: string; color: string } {
  if (bmi < 18.5) return { label: 'Bajo Peso',              color: 'text-blue-500'   };
  if (bmi < 25.0) return { label: 'Normal',                 color: 'text-emerald-500' };
  if (bmi < 30.0) return { label: 'Sobrepeso',              color: 'text-amber-500'  };
  if (bmi < 35.0) return { label: 'Obesidad Grado I',       color: 'text-orange-500' };
  if (bmi < 40.0) return { label: 'Obesidad Grado II',      color: 'text-rose-500'   };
  return             { label: 'Obesidad Grado III (Mórbida)', color: 'text-rose-700'   };
}

// ── Tasa Metabólica Basal (Mifflin-St Jeor) ──────────────────────────────────
export function calcBMR(weightKg: number, heightCm: number, age: number, gender: Gender): number {
  const base = (10 * weightKg) + (6.25 * heightCm) - (5 * age);
  return gender === 'Masculino' ? base + 5 : base - 161;
}

// ── Gasto Energético Total ────────────────────────────────────────────────────
export function calcTotalCalories(bmr: number, level: ActivityLevel): number {
  return bmr * ACTIVITY_FACTORS[level].factor;
}

// ── Relación Cintura/Cadera ───────────────────────────────────────────────────
export function calcWHR(waistCm: number, hipCm: number): number {
  return waistCm / hipCm;
}

export function classifyWHR(ratio: number, gender: Gender): { label: string; color: string } {
  const threshold = gender === 'Masculino' ? 0.95 : 0.80;
  return ratio < threshold
    ? { label: 'Riesgo cardiovascular bajo', color: 'text-emerald-500' }
    : { label: 'Riesgo cardiovascular elevado', color: 'text-rose-500' };
}

// ── Relación Cintura/Talla ────────────────────────────────────────────────────
export function calcWHtR(waistCm: number, heightCm: number): number {
  return waistCm / heightCm;
}

export function classifyWHtR(ratio: number): { label: string; color: string } {
  if (ratio < 0.4)  return { label: 'Bajo peso / Delgadez', color: 'text-blue-500'    };
  if (ratio < 0.5)  return { label: 'Saludable',            color: 'text-emerald-500' };
  if (ratio < 0.6)  return { label: 'Sobrepeso',            color: 'text-amber-500'  };
  return                    { label: 'Obesidad',             color: 'text-rose-500'   };
}

// ── Cálculo integral ─────────────────────────────────────────────────────────
export interface NutritionMetrics {
  bmi:              number;
  bmiClassification: ReturnType<typeof classifyBMI>;
  bmr:              number;
  totalCalories:    number;
  whr:              number;
  whrClassification: ReturnType<typeof classifyWHR>;
  whtR:             number;
  whtRClassification: ReturnType<typeof classifyWHtR>;
}

export function calcAllMetrics(
  weightKg: number, heightCm: number, waistCm: number, hipCm: number,
  age: number, gender: Gender, activity: ActivityLevel
): NutritionMetrics | null {
  if (!weightKg || !heightCm || age < 1) return null;

  const bmi  = calcBMI(weightKg, heightCm);
  const bmr  = calcBMR(weightKg, heightCm, age, gender);
  const kcal = calcTotalCalories(bmr, activity);
  const whr  = waistCm && hipCm ? calcWHR(waistCm, hipCm) : 0;
  const whtR = waistCm          ? calcWHtR(waistCm, heightCm) : 0;

  return {
    bmi:               Math.round(bmi * 10) / 10,
    bmiClassification: classifyBMI(bmi),
    bmr:               Math.round(bmr),
    totalCalories:     Math.round(kcal),
    whr:               Math.round(whr * 100) / 100,
    whrClassification: whr  ? classifyWHR(whr, gender)  : { label: '—', color: 'text-slate-400' },
    whtR:              Math.round(whtR * 100) / 100,
    whtRClassification: whtR ? classifyWHtR(whtR) : { label: '—', color: 'text-slate-400' },
  };
}
