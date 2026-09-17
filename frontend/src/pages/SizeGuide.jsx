const SIZE_CHART = [
  { size: 'S', chest: '34–36"', waist: '28–30"', hips: '35–37"' },
  { size: 'M', chest: '38–40"', waist: '31–33"', hips: '38–40"' },
  { size: 'L', chest: '41–43"', waist: '34–36"', hips: '41–43"' },
  { size: 'XL', chest: '44–46"', waist: '37–39"', hips: '44–46"' },
  { size: 'XXL', chest: '47–49"', waist: '40–42"', hips: '47–49"' },
];

export default function SizeGuide() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="mb-4 text-2xl font-semibold text-stone-900">Size Guide</h1>
      <p className="mb-6 text-sm leading-relaxed text-stone-600">
        General measurements in inches. Fit varies slightly by style — check the individual
        product description for notes on cut and fabric stretch.
      </p>

      <div className="overflow-x-auto rounded-lg border border-stone-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">Chest</th>
              <th className="px-4 py-3">Waist</th>
              <th className="px-4 py-3">Hips</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {SIZE_CHART.map((row) => (
              <tr key={row.size}>
                <td className="px-4 py-3 font-medium text-stone-900">{row.size}</td>
                <td className="px-4 py-3 text-stone-600">{row.chest}</td>
                <td className="px-4 py-3 text-stone-600">{row.waist}</td>
                <td className="px-4 py-3 text-stone-600">{row.hips}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
