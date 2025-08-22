const yahooFinance = require('yahoo-finance2').default;

async function test() {
  try {
    const data = await yahooFinance.chart('QQQT', {
      interval: '1d',    // Using 1d interval (daily)
      range: '1mo'       // Last 1 month of data
    });

    console.log(data); // Logs the result to see the structure

  } catch (err) {
    console.error('Error fetching data:', err);
  }
}

test();
