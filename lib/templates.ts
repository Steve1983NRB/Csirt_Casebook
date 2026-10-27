import {z} from 'zod';
import {playbookIds} from './playbooks';

export const templateData=z.object({incidentType:z.string().trim().max(300).default(''),tlp:z.enum(['TLP:AMBER','TLP:AMBER+STRICT','TLP:RED','TLP:GREEN','TLP:CLEAR']).default('TLP:AMBER'),priority:z.enum(['Unassessed','P1','P2','P3','P4']).default('Unassessed'),urgency:z.string().trim().max(300).default(''),playbook:z.enum(playbookIds).default('standard'),team:z.string().trim().max(300).default(''),tags:z.array(z.string().trim().min(1).max(40)).max(20).default([]),scope:z.string().max(20000).default(''),impact:z.string().max(20000).default(''),actions:z.array(z.object({title:z.string().trim().min(1).max(300),description:z.string().max(2000).default(''),priority:z.enum(['High','Medium','Low']).default('Medium')})).max(50).default([])});
export type TemplateData=z.infer<typeof templateData>;

export const linkRelations=['related','duplicate','parent','child','same-actor','same-campaign'] as const;
export const DATASTORE_MAX_FILE=25*1024*1024,DATASTORE_MAX_FILES=300,DATASTORE_MAX_TOTAL=500*1024*1024;
export const attributeTypes=['text','number','date','select','boolean','url'] as const;
export type AttributeType=typeof attributeTypes[number];
