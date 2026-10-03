import { expect, it } from 'vitest'
import { defaultMaterial, withSlicerResult } from './materialEstimate'
it('replacing stale mass clears old duration, and metadata edits retain stale identity',()=>{const old={...defaultMaterial,slicerGrams:4,slicerMinutes:20,slicerGeometryKey:'old'};const next=withSlicerResult(old,'new','slicerGrams',7);expect(next.slicerMinutes).toBeUndefined();expect(next.slicerGeometryKey).toBe('new');expect({...old,pricePerKg:25}.slicerGeometryKey).toBe('old');expect(withSlicerResult(next,'new','slicerMinutes',30).slicerGrams).toBe(7)})
