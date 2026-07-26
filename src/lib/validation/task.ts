import { z } from "zod";
export const recurrenceConfigSchema = z.discriminatedUnion("type", [
 z.object({type:z.literal("once")}), z.object({type:z.literal("daily")}),
 z.object({type:z.literal("weekdays"),weekdays:z.array(z.number().int().min(0).max(6)).min(1)}),
 z.object({type:z.literal("times_per_week"),target:z.number().int().min(1).max(7)}),
 z.object({type:z.literal("interval"),every:z.number().int().min(1).max(365),unit:z.enum(["day","week","month"])})
]);
export const taskSchema = z.object({ title:z.string().trim().min(1).max(140), description:z.string().max(2000).optional().nullable(), emoji:z.string().max(16).optional().nullable(), scheduleId:z.string().uuid(), categoryId:z.string().uuid().optional().nullable(), recurrence:recurrenceConfigSchema, startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(), timing:z.discriminatedUnion("mode",[z.object({mode:z.literal("anytime")}),z.object({mode:z.literal("day_part"),dayPart:z.enum(["morning","afternoon","night"])}),z.object({mode:z.literal("specific_time"),startTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)}),z.object({mode:z.literal("time_range"),startTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),endTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)})]) }).superRefine((v,c)=>{if(v.endDate&&v.endDate<v.startDate)c.addIssue({code:"custom",message:"End date must follow start date",path:["endDate"]});if(v.timing.mode==="time_range"&&v.timing.startTime>=v.timing.endTime)c.addIssue({code:"custom",message:"Time ranges cannot cross midnight",path:["timing","endTime"]});});
export type RecurrenceConfig=z.infer<typeof recurrenceConfigSchema>;

