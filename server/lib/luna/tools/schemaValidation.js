function actualType(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (Number.isInteger(value)) return 'integer'
  return typeof value
}

function allowedTypes(schema = {}) {
  const raw = schema.type
  return Array.isArray(raw) ? raw : (raw ? [raw] : [])
}

function typeMatches(value, type) {
  if (type === 'null') return value === null
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  if (type === 'integer') return Number.isInteger(value)
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  return typeof value === type
}

export function validateJsonSchema(value, schemaInput = {}, path = '$') {
  const schema = schemaInput && typeof schemaInput === 'object' ? schemaInput : {}
  const issues = []
  const types = allowedTypes(schema)
  if (types.length && !types.some((type) => typeMatches(value, type))) {
    return [{ path, code: 'type', expected: types, actual: actualType(value) }]
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => Object.is(entry, value))) {
    issues.push({ path, code: 'enum', expected: schema.enum, actual: value })
  }
  if (value === null || value === undefined) return issues

  if (Array.isArray(value)) {
    if (Number.isFinite(schema.minItems) && value.length < schema.minItems) {
      issues.push({ path, code: 'minItems', expected: schema.minItems, actual: value.length })
    }
    value.forEach((entry, index) => {
      issues.push(...validateJsonSchema(entry, schema.items || {}, `${path}[${index}]`))
    })
    return issues
  }

  if (typeof value === 'object') {
    const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {}
    for (const required of Array.isArray(schema.required) ? schema.required : []) {
      if (!Object.hasOwn(value, required)) issues.push({ path: `${path}.${required}`, code: 'required' })
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) issues.push({ path: `${path}.${key}`, code: 'additionalProperties' })
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) issues.push(...validateJsonSchema(value[key], childSchema, `${path}.${key}`))
    }
    return issues
  }

  if (typeof value === 'string') {
    if (Number.isFinite(schema.minLength) && value.length < schema.minLength) {
      issues.push({ path, code: 'minLength', expected: schema.minLength, actual: value.length })
    }
    if (Number.isFinite(schema.maxLength) && value.length > schema.maxLength) {
      issues.push({ path, code: 'maxLength', expected: schema.maxLength, actual: value.length })
    }
  }
  return issues
}
