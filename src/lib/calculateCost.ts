import { DatabaseService } from "@/lib/database"
import { query } from "@/lib/postgres"
import { UsageData, CostResult } from '../types/logs';

// Default fallback if DB misses data
const FALLBACK = {
  gpt: { in: 0.40, out: 1.60 },
  tts: 50 / 1_000_000,
  sttInrPerSec: 30 / 3600
};

async function getUsdToInr(onDate: string | Date): Promise<number> {
  const date = new Date(onDate).toISOString().slice(0, 10);
  const result = await query(
    'SELECT rate FROM usd_to_inr_rate WHERE as_of = $1',
    [date]
  );
  
  if (result.rows.length === 0 || !result.rows[0]?.rate) {
    return 87.56; // Fallback rate
  }
  return parseFloat(result.rows[0].rate);
}

export async function fetchRate(pricingColumn: string, table: string, filters: Record<string, any>): Promise<number | null> {
  const filterKeys = Object.keys(filters);
  const filterValues = Object.values(filters);
  const whereClause = filterKeys.map((key, index) => `${key} = $${index + 1}`).join(' AND ');
  
  const result = await query(
    `SELECT ${pricingColumn} FROM ${table} WHERE ${whereClause}`,
    filterValues
  );
  
  if (result.rows.length === 0 || result.rows[0][pricingColumn] == null) {
    return null;
  }
  return parseFloat(result.rows[0][pricingColumn]);
}

interface TotalCostsParams {
  usageArr?: UsageData[];
  modelName?: string;
  callStartedAt?: string | Date;
}

export async function totalCostsINR({
  usageArr = [],
  modelName = 'gpt-4.1-mini',
  callStartedAt = new Date()
}: TotalCostsParams): Promise<CostResult> {
  const [usdToInr, gptRatesResult, ttsUsdResult, sttUsdSecResult] = await Promise.all([
    getUsdToInr(callStartedAt),
    query(
      `SELECT input_usd_per_million, output_usd_per_million 
       FROM gpt_api_pricing 
       WHERE model_name = $1`,
      [modelName]
    ),
    query(
      `SELECT cost_usd_per_unit 
       FROM audio_api_pricing 
       WHERE unit = 'character' AND provider = 'ElevenLabs' AND model_or_plan LIKE '%Flash%'`
    ),
    query(
      `SELECT cost_inr_per_unit 
       FROM audio_api_pricing 
       WHERE unit = 'second' AND provider = 'Sarvam AI' AND model_or_plan LIKE '%transcription%'`
    )
  ]);

  const gptRates = gptRatesResult.rows[0];
  const gptInUsd = gptRates == null
    ? FALLBACK.gpt.in
    : parseFloat(gptRates.input_usd_per_million);

  const gptOutUsd = gptRates == null
    ? FALLBACK.gpt.out
    : parseFloat(gptRates.output_usd_per_million);

  const ttsData = ttsUsdResult.rows[0];
  const ttsUsdPerChar = ttsData == null
    ? FALLBACK.tts
    : parseFloat(ttsData.cost_usd_per_unit);

  const sttData = sttUsdSecResult.rows[0];
  let sttInrPerSec = sttData?.cost_inr_per_unit;
  if (sttInrPerSec == null) {
    sttInrPerSec = FALLBACK.sttInrPerSec;
  }

  let totalLlmInr = 0;
  let totalTtsInr = 0;
  let totalSttInr = 0;

  for (const u of usageArr) {
    const promptUsd = (u.llm_prompt_tokens || 0) / 1e6 * gptInUsd;
    const outUsd = (u.llm_completion_tokens || 0) / 1e6 * gptOutUsd;
    const llmUsd = promptUsd + outUsd;
    const llmInr = llmUsd * usdToInr;

    const ttsInr = (u.tts_characters || 0) * ttsUsdPerChar * usdToInr;
    const sttInr = (u.stt_audio_duration || 0) * sttInrPerSec;

    totalLlmInr += llmInr;
    totalTtsInr += ttsInr;
    totalSttInr += sttInr;
  }

  return {
    total_llm_cost_inr: Number(totalLlmInr.toFixed(2)),
    total_tts_cost_inr: Number(totalTtsInr.toFixed(2)),
    total_stt_cost_inr: Number(totalSttInr.toFixed(2))
  };
}