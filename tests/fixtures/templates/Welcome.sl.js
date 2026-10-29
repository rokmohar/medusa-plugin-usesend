const { createElement } = require('react')

const Welcome = ({ name }) => createElement('p', null, `Dobrodošli, ${name}!`)

Welcome.Subject = 'Dobrodošli'

module.exports = Welcome
