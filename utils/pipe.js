const pipe =
  (...functions) =>
  (input) =>
    functions.reduce((chain, func) => chain.then(func), Promise.resolve(input)); // https://itnext.io/roll-your-own-async-compose-pipe-functions-658cafe4c46f

module.exports = pipe;
