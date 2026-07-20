import { describe, expect, it } from 'vitest'
import { parseLegacyClients, parseLegacyProducts } from './legacyImport'

describe('legacyImport', () => {
  it('imports products from CSV and reports invalid rows', async () => {
    const csv = [
      'codigo,descricao,preco venda,estoque',
      'P-1,Racao Premium,"49,90",3',
      ',Linha sem codigo,10,1',
    ].join('\n')
    const file = new File([csv], 'produtos.csv', { type: 'text/csv' })

    const result = await parseLegacyProducts(file)

    expect(result.totalRows).toBe(2)
    expect(result.skipped).toBe(1)
    expect(result.rows[0]).toMatchObject({ legacyCode: 'P-1', name: 'Racao Premium', stockQuantity: 3 })
  })

  it('imports clients from CSV', async () => {
    const csv = 'codigo,nome,telefone\nC-1,Maria,11999999999'
    const file = new File([csv], 'clientes.csv', { type: 'text/csv' })

    const result = await parseLegacyClients(file)

    expect(result.rows[0]).toMatchObject({ legacyCode: 'C-1', name: 'Maria', phone: '11999999999' })
  })

  it('rejects legacy XLS files', async () => {
    const file = new File(['legacy'], 'clientes.xls')
    await expect(parseLegacyClients(file)).rejects.toThrow(/\.xls nao e mais aceito/i)
  })
})
