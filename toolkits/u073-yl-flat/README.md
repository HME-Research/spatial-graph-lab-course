# Student Flat

Plan a large student flat with private bedrooms, a shared kitchen and a living room. Count how many students can sleep there and see how the total changes when larger bedrooms have two beds.

## Functions and attributes

| Function | ID | Attributes |
|---|---|---|
| Bedroom | `bedroom` | Nominal floor area in m² from the drawn footprint (`area`). Number of beds (`beds`, number, initially 1). |
| Kitchen | `kitchen` | Has a window (`hasWindow`, yes/no, initially yes). |
| Living room | `living-room` | Number of seats (`seats`, number, initially 4). |

Edit bed counts, seats and window records in Properties. Resize a bedroom to change its nominal floor area. Each floor cell covers 9 m².

## Try the algorithms

1. Run `npm.cmd run dev` and open the printed local address with `?toolkit=u073-yl-flat`. Choose **Create project** with **Student Flat**.
2. Draw two bedrooms, one covering a single cell (9 m²) and one covering two cells side by side (18 m²). Add a shared kitchen and a living room.
3. Run **Analyse › Network › Count beds**. With the default of one bed per bedroom, the total is 2.
4. Run **Transform › Assign two beds**. The preview sets the 18 m² bedroom to exactly two beds. Apply the change and run **Count beds** again to see a total of 3.

## Designs

Draw your own flat in the app. Follow [Add your flat design](designs/README.md) to include it in **Open toolkit design…**.
