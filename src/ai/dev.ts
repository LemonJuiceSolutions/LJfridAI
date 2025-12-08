import { config } from 'dotenv';
config();

import '@/ai/flows/generate-decision-tree.ts';
import '@/ai/flows/rephrase-question.ts';
import '@/ai/flows/extract-variables.ts';
import '@/ai/flows/diagnose-problem.ts';
import '@/ai/flows/propose-consolidations.ts';
import '@/ai/flows/detai-flow.ts';
