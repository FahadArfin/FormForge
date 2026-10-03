import {expect,it} from 'vitest'
import {calibratedScale} from './referenceImages'
it('calibrates pixel distances in millimeters',()=>expect(calibratedScale({x:10,y:20},{x:70,y:100},25.4)).toBeCloseTo(0.254))
it('rejects coincident, nonfinite and negative inputs',()=>{expect(()=>calibratedScale({x:0,y:0},{x:0,y:0},10)).toThrow();expect(()=>calibratedScale({x:0,y:0},{x:100,y:0},-1)).toThrow();expect(()=>calibratedScale({x:NaN,y:0},{x:100,y:0},10)).toThrow()})
