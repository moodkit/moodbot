module.exports = {
  extends: "airbnb-base",
  env: {
    "node": true
  },
  rules: {
    "comma-dangle": ["error", "only-multiline"],
    "max-len": [1, 120, 2, { ignoreComments: true }],
    "no-else-return": 0,
    "no-param-reassign": 0,
    "no-console": 0,
    "no-restricted-syntax": ["error", "ForInStatement", "LabeledStatement", "WithStatement"]
  }
};