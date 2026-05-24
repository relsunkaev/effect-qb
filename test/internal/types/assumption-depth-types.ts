import * as Std from "effect-qb"
import { Query as Q } from "effect-qb/postgres"

const stress = Std.Table.make("stress", {
  value: Std.Column.text().pipe(Std.Column.nullable)
})

const p0 = Q.select({ value: stress.value }).pipe(
  Q.from(stress),
  Q.where(Q.isNotNull(stress.value))
)
const p1 = p0.pipe(Q.where(Q.isNotNull(stress.value)))
const p2 = p1.pipe(Q.where(Q.isNotNull(stress.value)))
const p3 = p2.pipe(Q.where(Q.isNotNull(stress.value)))
const p4 = p3.pipe(Q.where(Q.isNotNull(stress.value)))
const p5 = p4.pipe(Q.where(Q.isNotNull(stress.value)))
const p6 = p5.pipe(Q.where(Q.isNotNull(stress.value)))
const p7 = p6.pipe(Q.where(Q.isNotNull(stress.value)))
const p8 = p7.pipe(Q.where(Q.isNotNull(stress.value)))
const p9 = p8.pipe(Q.where(Q.isNotNull(stress.value)))
const p10 = p9.pipe(Q.where(Q.isNotNull(stress.value)))
const p11 = p10.pipe(Q.where(Q.isNotNull(stress.value)))
const p12 = p11.pipe(Q.where(Q.isNotNull(stress.value)))
const p13 = p12.pipe(Q.where(Q.isNotNull(stress.value)))
const p14 = p13.pipe(Q.where(Q.isNotNull(stress.value)))
const p15 = p14.pipe(Q.where(Q.isNotNull(stress.value)))
const p16 = p15.pipe(Q.where(Q.isNotNull(stress.value)))
const p17 = p16.pipe(Q.where(Q.isNotNull(stress.value)))
const p18 = p17.pipe(Q.where(Q.isNotNull(stress.value)))
const p19 = p18.pipe(Q.where(Q.isNotNull(stress.value)))
const p20 = p19.pipe(Q.where(Q.isNotNull(stress.value)))
const p21 = p20.pipe(Q.where(Q.isNotNull(stress.value)))
const p22 = p21.pipe(Q.where(Q.isNotNull(stress.value)))
const p23 = p22.pipe(Q.where(Q.isNotNull(stress.value)))
const p24 = p23.pipe(Q.where(Q.isNotNull(stress.value)))
const p25 = p24.pipe(Q.where(Q.isNotNull(stress.value)))
const p26 = p25.pipe(Q.where(Q.isNotNull(stress.value)))
const p27 = p26.pipe(Q.where(Q.isNotNull(stress.value)))
const p28 = p27.pipe(Q.where(Q.isNotNull(stress.value)))
const p29 = p28.pipe(Q.where(Q.isNotNull(stress.value)))
const p30 = p29.pipe(Q.where(Q.isNotNull(stress.value)))
const p31 = p30.pipe(Q.where(Q.isNotNull(stress.value)))
const p32 = p31.pipe(Q.where(Q.isNotNull(stress.value)))
const p33 = p32.pipe(Q.where(Q.isNotNull(stress.value)))
const p34 = p33.pipe(Q.where(Q.isNotNull(stress.value)))
const p35 = p34.pipe(Q.where(Q.isNotNull(stress.value)))
const p36 = p35.pipe(Q.where(Q.isNotNull(stress.value)))
const p37 = p36.pipe(Q.where(Q.isNotNull(stress.value)))
const p38 = p37.pipe(Q.where(Q.isNotNull(stress.value)))
const p39 = p38.pipe(Q.where(Q.isNotNull(stress.value)))

type Row = Q.ResultRow<typeof p39>

declare const row: Row
const value: string = row.value
void value
