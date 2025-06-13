// utils/mejorarNombreProducto.js
import fetch from 'node-fetch';

export async function mejorarNombreProducto(nombre) {
  const prompt = `Reescribe este nombre de producto para que suene más atractivo y humano: "${nombre}"`;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': ``,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [{role: "user", content: prompt}],
      max_tokens: 30,
      temperature: 0.7
    })
  });
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || nombre;
}