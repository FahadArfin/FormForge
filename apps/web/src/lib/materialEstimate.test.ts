import {expect,it} from 'vitest'
import {materialEstimate,defaultMaterial} from './materialEstimate'
it('converts cubic millimeters to grams and separates entered slicer mass',()=>{expect(materialEstimate(10000,{...defaultMaterial,pricePerKg:20,slicerGrams:5})).toEqual({solidGrams:12.4,solidCost:0.248,slicerCost:0.1})})
it('rejects nonfinite or negative assumptions',()=>{expect(()=>materialEstimate(NaN,defaultMaterial)).toThrow();expect(()=>materialEstimate(10,{...defaultMaterial,density:-1})).toThrow()})
