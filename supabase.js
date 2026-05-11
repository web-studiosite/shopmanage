/* ============================================
   SHOP ADMINISTRATION ERP
   supabase.js - Integração Supabase + Offline Fallback
   ============================================ */

const SupabaseAPI = {
  client: null,
  online: navigator.onLine,
  syncQueue: [],
  config: null,

  /* === INICIALIZAÇÃO === */
  
  async init() {
    this.config = Formulas.storageGet('supabase_config', {});
    
    if (this.config.url && this.config.key) {
      try {
        this.client = supabase.createClient(this.config.url, this.config.key, {
          auth: { persistSession: true, autoRefreshToken: true }
        });
        await this.testConnection();
      } catch (err) {
        console.warn('Supabase não disponível, modo offline:', err.message);
        this.client = null;
      }
    }

    // Listeners de conectividade
    window.addEventListener('online', () => {
      this.online = true;
      this.onOnline();
    });
    window.addEventListener('offline', () => {
      this.online = false;
      this.onOffline();
    });

    // Carregar fila de sincronização
    this.syncQueue = Formulas.storageGet('sync_queue', []);
    
    return this;
  },

  setConfig(url, key) {
    this.config = { url, key };
    Formulas.storageSet('supabase_config', this.config);
    return this.init();
  },

  async testConnection() {
    if (!this.client) return false;
    try {
      const { data, error } = await this.client.from('produtos').select('count').limit(1);
      if (error) throw error;
      this.online = true;
      return true;
    } catch {
      this.online = false;
      return false;
    }
  },

  isOnline() {
    return this.online && this.client !== null;
  },

  /* === CALLBACKS DE CONECTIVIDADE === */
  
  onOnline() {
    console.log('Sistema online - sincronizando...');
    this.showToast('Sincronizando dados...', 'info');
    this.processSyncQueue();
  },

  onOffline() {
    console.log('Sistema offline - usando localStorage');
    this.showToast('Modo offline ativado', 'warning');
  },

  /* === OPERAÇÕES CRUD === */
  
  async select(table, options = {}) {
    const { columns = '*', filters = {}, order = {}, limit = null } = options;
    
    if (this.isOnline()) {
      try {
        let query = this.client.from(table).select(columns);
        
        Object.entries(filters).forEach(([col, val]) => {
          if (Array.isArray(val)) {
            query = query.in(col, val);
          } else if (typeof val === 'object' && val.op) {
            query = query.filter(col, val.op, val.value);
          } else {
            query = query.eq(col, val);
          }
        });

        if (order.column) {
          query = query.order(order.column, { ascending: order.ascending !== false });
        }
        if (limit) query = query.limit(limit);

        const { data, error } = await query;
        if (error) throw error;
        
        // Cache local
        Formulas.storageSet(`table_${table}`, data || []);
        return { data: data || [], error: null, fromCache: false };
      } catch (err) {
        console.warn(`Erro Supabase (${table}):`, err.message);
        return this.getFromCache(table);
      }
    }
    return this.getFromCache(table);
  },

  async insert(table, data) {
    // Validação
    if (!data || typeof data !== 'object') {
      return { data: null, error: 'Dados inválidos' };
    }
    
    const record = {
      ...data,
      id: data.id || Formulas.generateId(),
      created_at: data.created_at || Formulas.getAgora(),
      updated_at: Formulas.getAgora()
    };

    if (this.isOnline()) {
      try {
        const { data: result, error } = await this.client
          .from(table)
          .insert(record)
          .select()
          .single();
        
        if (error) throw error;
        this.updateLocalCache(table, result);
        return { data: result, error: null };
      } catch (err) {
        console.warn(`Insert erro (${table}):`, err.message);
        return this.queueOperation('insert', table, record);
      }
    }
    return this.queueOperation('insert', table, record);
  },

  async update(table, id, data) {
    const record = { ...data, updated_at: Formulas.getAgora() };

    if (this.isOnline()) {
      try {
        const { data: result, error } = await this.client
          .from(table)
          .update(record)
          .eq('id', id)
          .select()
          .single();
        
        if (error) throw error;
        this.updateLocalCacheItem(table, result);
        return { data: result, error: null };
      } catch (err) {
        console.warn(`Update erro (${table}):`, err.message);
        return this.queueOperation('update', table, { id, ...record });
      }
    }
    return this.queueOperation('update', table, { id, ...record });
  },

  async delete(table, id) {
    if (this.isOnline()) {
      try {
        const { error } = await this.client.from(table).delete().eq('id', id);
        if (error) throw error;
        this.removeFromLocalCache(table, id);
        return { error: null };
      } catch (err) {
        console.warn(`Delete erro (${table}):`, err.message);
        return this.queueOperation('delete', table, { id });
      }
    }
    return this.queueOperation('delete', table, { id });
  },

  async upsert(table, data, matchColumn = 'id') {
    const record = {
      ...data,
      id: data.id || Formulas.generateId(),
      updated_at: Formulas.getAgora()
    };
    if (!record.created_at) record.created_at = Formulas.getAgora();

    if (this.isOnline()) {
      try {
        const { data: result, error } = await this.client
          .from(table)
          .upsert(record, { onConflict: matchColumn })
          .select()
          .single();
        
        if (error) throw error;
        this.updateLocalCacheItem(table, result);
        return { data: result, error: null };
      } catch (err) {
        return this.queueOperation('upsert', table, record);
      }
    }
    return this.queueOperation('upsert', table, record);
  },

  /* === CACHE LOCAL === */
  
  getFromCache(table) {
    const data = Formulas.storageGet(`table_${table}`, []);
    return { data, error: null, fromCache: true };
  },

  updateLocalCache(table, newRecords) {
    if (!Array.isArray(newRecords)) newRecords = [newRecords];
    const existing = Formulas.storageGet(`table_${table}`, []);
    const merged = [...existing];
    
    newRecords.forEach(rec => {
      const idx = merged.findIndex(e => e.id === rec.id);
      if (idx >= 0) merged[idx] = rec;
      else merged.push(rec);
    });
    
    Formulas.storageSet(`table_${table}`, merged);
  },

  updateLocalCacheItem(table, record) {
    const existing = Formulas.storageGet(`table_${table}`, []);
    const idx = existing.findIndex(e => e.id === record.id);
    if (idx >= 0) existing[idx] = record;
    else existing.push(record);
    Formulas.storageSet(`table_${table}`, existing);
  },

  removeFromLocalCache(table, id) {
    const existing = Formulas.storageGet(`table_${table}`, []);
    Formulas.storageSet(`table_${table}`, existing.filter(e => e.id !== id));
  },

  /* === FILA DE SINCRONIZAÇÃO === */
  
  queueOperation(operation, table, data) {
    const op = { operation, table, data, timestamp: Formulas.getAgora(), synced: false };
    this.syncQueue.push(op);
    Formulas.storageSet('sync_queue', this.syncQueue);
    
    // Atualizar cache local imediatamente
    this.applyLocalOperation(operation, table, data);
    
    return { data, error: null, queued: true };
  },

  applyLocalOperation(operation, table, data) {
    const existing = Formulas.storageGet(`table_${table}`, []);
    
    switch (operation) {
      case 'insert':
      case 'upsert':
        const idx = existing.findIndex(e => e.id === data.id);
        if (idx >= 0) existing[idx] = { ...existing[idx], ...data };
        else existing.push(data);
        break;
      case 'update':
        const upIdx = existing.findIndex(e => e.id === data.id);
        if (upIdx >= 0) existing[upIdx] = { ...existing[upIdx], ...data };
        break;
      case 'delete':
        Formulas.storageSet(`table_${table}`, existing.filter(e => e.id !== data.id));
        return;
    }
    Formulas.storageSet(`table_${table}`, existing);
  },

  async processSyncQueue() {
    if (!this.isOnline() || this.syncQueue.length === 0) return;
    
    const pending = this.syncQueue.filter(op => !op.synced);
    let synced = 0;
    
    for (const op of pending) {
      try {
        let result;
        switch (op.operation) {
          case 'insert':
            result = await this.client.from(op.table).insert(op.data).select().single();
            break;
          case 'update':
            result = await this.client.from(op.table).update(op.data).eq('id', op.data.id).select().single();
            break;
          case 'delete':
            result = await this.client.from(op.table).delete().eq('id', op.data.id);
            break;
          case 'upsert':
            result = await this.client.from(op.table).upsert(op.data).select().single();
            break;
        }
        if (result.error) throw result.error;
        op.synced = true;
        synced++;
      } catch (err) {
        console.warn(`Falha ao sincronizar operação:`, err);
      }
    }
    
    this.syncQueue = this.syncQueue.filter(op => !op.synced);
    Formulas.storageSet('sync_queue', this.syncQueue);
    
    if (synced > 0) {
      this.showToast(`${synced} operações sincronizadas`, 'success');
    }
  },

  /* === OPERAÇÕES ESPECÍFICAS === */
  
  async getProdutos() {
    return this.select('produtos', { order: { column: 'nome' } });
  },

  async getProdutoById(id) {
    return this.select('produtos', { filters: { id } });
  },

  async getProdutoByCodigo(codigo) {
    return this.select('produtos', { filters: { codigo } });
  },

  async saveProduto(produto) {
    if (produto.id) return this.update('produtos', produto.id, produto);
    return this.insert('produtos', produto);
  },

  async deleteProduto(id) {
    return this.delete('produtos', id);
  },

  async getVendas(filters = {}) {
    const options = { 
      order: { column: 'created_at', ascending: false } 
    };
    if (Object.keys(filters).length) options.filters = filters;
    return this.select('vendas', options);
  },

  async saveVenda(venda) {
    return this.insert('vendas', venda);
  },

  async getMovimentacoes(table = 'movimentacoes', filters = {}) {
    return this.select(table, { 
      filters, 
      order: { column: 'created_at', ascending: false } 
    });
  },

  async saveMovimentacao(mov) {
    return this.insert('movimentacoes', mov);
  },

  async getCaixa(filters = {}) {
    return this.select('caixa', { 
      filters, 
      order: { column: 'created_at', ascending: false } 
    });
  },

  async saveCaixa(mov) {
    return this.insert('caixa', mov);
  },

  async getBombas() {
    return this.select('bombas', { order: { column: 'nome' } });
  },

  async saveBomba(bomba) {
    if (bomba.id) return this.update('bombas', bomba.id, bomba);
    return this.insert('bombas', bomba);
  },

  async getMovimentacoesCombustivel() {
    return this.select('movimentacoes_combustivel', { 
      order: { column: 'created_at', ascending: false } 
    });
  },

  async saveMovimentacaoCombustivel(mov) {
    return this.insert('movimentacoes_combustivel', mov);
  },

  async getPerdas() {
    return this.select('perdas', { order: { column: 'created_at', ascending: false } });
  },

  async savePerda(perda) {
    return this.insert('perdas', perda);
  },

  async getRoubos() {
    return this.select('roubos', { order: { column: 'created_at', ascending: false } });
  },

  async saveRoubo(roubo) {
    return this.insert('roubos', roubo);
  },

  async getTransferencias() {
    return this.select('transferencias', { 
      order: { column: 'created_at', ascending: false } 
    });
  },

  async saveTransferencia(transf) {
    return this.insert('transferencias', transf);
  },

  async getFechamentos() {
    return this.select('fechamentos', { 
      order: { column: 'created_at', ascending: false } 
    });
  },

  async saveFechamento(fechamento) {
    return this.insert('fechamentos', fechamento);
  },

  async getCategorias() {
    return this.select('categorias', { order: { column: 'nome' } });
  },

  async saveCategoria(categoria) {
    if (categoria.id) return this.update('categorias', categoria.id, categoria);
    return this.insert('categorias', categoria);
  },

  async deleteCategoria(id) {
    return this.delete('categorias', id);
  },

  /* === UTILITÁRIOS === */
  
  showToast(message, type = 'info') {
    if (window.App && window.App.toast) {
      window.App.toast(message, type);
    } else {
      console.log(`[${type}] ${message}`);
    }
  },

  getStats() {
    return {
      online: this.isOnline(),
      config: !!this.config?.url,
      queueSize: this.syncQueue.filter(op => !op.synced).length,
      cachedTables: Object.keys(localStorage)
        .filter(k => k.startsWith('table_'))
        .map(k => k.replace('table_', ''))
    };
  }
};

// Global API
window.SupabaseAPI = SupabaseAPI;
