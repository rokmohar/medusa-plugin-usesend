const { createElement } = require('react')

const Welcome = ({ name }) => createElement('p', null, `Welcome, ${name}!`)

Welcome.Subject = 'Welcome'
Welcome.PreviewProps = { name: 'Ana' }

module.exports = Welcome
