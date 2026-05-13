const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const axios = require('axios');
const FormData = require('form-data');
const cheerio = require('cheerio');

async function test() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({ jar }));
  const form = new FormData();
  form.append('email', 'bibisventasyserviciosonline@gmail.com');
  form.append('password', 'IMPARAble_888');

  try {
    console.log("Login...");
    await client.post('https://nuvex.uy/index.php?route=account/login', form, { headers: form.getHeaders(), maxRedirects: 5 });

    console.log("Getting product page...");
    const res = await client.get('https://nuvex.uy/index.php?route=product/product&product_id=259');
    const $ = cheerio.load(res.data);
    
    console.log("Name:", $('#content h1').text().trim());
    console.log("Price:", $('.list-unstyled h2').first().text().trim() || $('#content h2').first().text().trim());
    console.log("Description:", $('#tab-description').text().replace(/\s+/g, ' ').trim());
    console.log("Breadcrumb:", $('.breadcrumb li').map((i,el)=>$(el).text().trim()).get().join(' > '));
    console.log("Main Image:", $('.thumbnails li:first-child a').attr('href') || $('.thumbnail').attr('href'));
    console.log("Option list:", $('#input-option259 option').map((i,el)=>$(el).text().trim()).get().join(', '));
  } catch (e) {
    console.error(e.message);
  }
}
test();
