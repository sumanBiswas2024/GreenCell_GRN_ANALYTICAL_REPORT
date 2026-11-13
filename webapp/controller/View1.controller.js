sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageToast"
], function(Controller, JSONModel, Filter, FilterOperator, MessageToast) {
	"use strict";

	return Controller.extend("Z_GRN_Report_GC.controller.View1", {
		onInit: function() {
			this.getView().setModel(new JSONModel({
				rows: []
			}), "plantData");
			this.getView().setModel(new JSONModel({
				rows: []
			}), "poData");
			this.getView().setModel(new JSONModel({
				rows: []
			}), "grnData");
			this.getView().setModel(new JSONModel({
				plantCount: "0",
				poCount: "0",
				documentCount: "0",
				completed: "0",
				pending: "0",
				rejected: "0",
				plantRows: "0"
			}), "summary");
			this._activePlant = "G120";
			this._activePo = "2601000180";
			this.onGo();
		},

		onGo: function() {
			var sPlant = this.byId("plantInput").getValue().trim();
			var sPo = this.byId("poInput").getValue().trim();
			if (!sPlant) {
				this._showError("Enter a plant to run the report.");
				return;
			}
			this._hideError();
			this._activePlant = sPlant;
			this._activePo = sPo;
			this.byId("selectedPlant").setText("Plant: " + sPlant);
			this.byId("selectedPo").setText(sPo ? "PO: " + sPo : "Select a PO");
			this.byId("poInput").setValue(sPo);
			this._read("/es_plant_wiseset", [new Filter("werks", FilterOperator.EQ, sPlant)], "plantData", this._onPlantData.bind(this));
			this._loadPos(sPlant);
			if (sPo) {
				this._loadGrns(sPlant, sPo);
			} else {
				this._setRows("grnData", []);
				this.byId("grnFooter").setText("Select a PO to view its GRN documents.");
			}
		},

		onReset: function() {
			this.byId("plantInput").setValue("G120");
			this.byId("poInput").setValue("2601000180");
			this.onGo();
		},

		onPlantSelect: function(oEvent) {
			var oRow = oEvent.getSource().getBindingContext("plantData").getObject();
			var sPlant = oRow.werks;
			this._activePlant = sPlant;
			this.byId("plantInput").setValue(sPlant);
			this.byId("selectedPlant").setText("Plant: " + sPlant);
			this.byId("poInput").setValue("");
			this._activePo = "";
			this.byId("selectedPo").setText("Select a PO");
			this._loadPos(sPlant);
			this._setRows("grnData", []);
			this.byId("grnFooter").setText("Select a PO to view its GRN documents.");
			this._scrollTo("poPanel");
		},

		onPoSelect: function(oEvent) {
			var oRow = oEvent.getSource().getBindingContext("poData").getObject();
			this._activePo = oRow.ebeln;
			this.byId("poInput").setValue(oRow.ebeln);
			this.byId("selectedPo").setText("PO: " + oRow.ebeln);
			this._loadGrns(this._activePlant, oRow.ebeln);
			this._scrollTo("grnPanel");
		},

		_loadPos: function(sPlant) {
			this._read("/es_powiseset", [new Filter("werks", FilterOperator.EQ, sPlant)], "poData", function() {});
		},

		_loadGrns: function(sPlant, sPo) {
			this.byId("selectedPlant").setText("Plant: " + sPlant);
			this.byId("selectedPo").setText("PO: " + sPo);
			this._read("/es_grnset", [new Filter("werks", FilterOperator.EQ, sPlant), new Filter("ebeln", FilterOperator.EQ, sPo)], "grnData",
				function(aRows) {
					this.byId("grnFooter").setText("Showing " + aRows.length + " material document" + (aRows.length === 1 ? "" : "s") + " for PO " +
						sPo + " at plant " + sPlant + ".");
				}.bind(this));
		},

		_onPlantData: function(aRows) {
			var oSummary = this.getView().getModel("summary");
			oSummary.setProperty("/plantCount", String(aRows.length));
			oSummary.setProperty("/plantRows", String(aRows.length));
			var oTotals = {
				poCount: 0,
				documentCount: 0,
				completed: 0,
				pending: 0,
				rejected: 0
			};
			aRows.forEach(function(oRow) {
				oTotals.poCount += this._num(oRow.ebeln);
				oTotals.documentCount += this._num(oRow.belnr);
				oTotals.completed += this._num(oRow.completed);
				oTotals.pending += this._num(oRow.pending);
				oTotals.rejected += this._num(oRow.rejected);
			}.bind(this));
			Object.keys(oTotals).forEach(function(sKey) {
				oSummary.setProperty("/" + sKey, String(oTotals[sKey]));
			});
		},

		_read: function(sPath, aFilters, sModelName, fnSuccess) {
			var oModel = this.getOwnerComponent().getModel();
			if (!oModel) {
				this._showError("The report service model is not configured.");
				return;
			}
			oModel.read(sPath, {
				filters: aFilters,
				success: function(oData) {
					this._hideError();
					var aRows = oData.results || [];
					this._setRows(sModelName, aRows);
					fnSuccess(aRows);
				}.bind(this),
				error: function(oError) {
					this._setRows(sModelName, []);
					this._showError(this._errorText(oError));
				}.bind(this)
			});
		},

		_setRows: function(sName, aRows) {
			this.getView().getModel(sName).setProperty("/rows", aRows);
		},

		_num: function(vValue) {
			var iValue = parseFloat(vValue);
			return isNaN(iValue) ? 0 : iValue;
		},

		_scrollTo: function(sId) {
			var oPage = this.byId("reportPage");
			var oTarget = this.byId(sId);
			setTimeout(function() {
				oPage.scrollToElement(oTarget.getDomRef(), 250);
			}, 0);
		},

		_showError: function(sText) {
			this.byId("messageStrip").setText(sText);
			this.byId("messageStrip").setVisible(true);
		},

		_hideError: function() {
			this.byId("messageStrip").setVisible(false);
		},

		_errorText: function(oError) {
			try {
				var oBody = JSON.parse(oError.responseText || "{}");
				return (oBody.error && oBody.error.message && oBody.error.message.value) ||
					"Unable to load report data. Check the service connection and try again.";
			} catch (e) {
				return "Unable to load report data. Check the service connection and try again.";
			}
		},

		onExport: function() {
			var aRows = this.getView().getModel("grnData").getProperty("/rows") || [];
			if (!aRows.length) {
				MessageToast.show("There are no GRN rows to export.");
				return;
			}
			var aColumns = ["mblnr", "bwart", "lfbnr", "xblnr", "matnr", "maktx", "meins", "menge", "acqty", "menge_i", "rjqty", "status",
				"budat", "budat_mkpf", "cputm", "lgort", "usnam", "bktxt", "vend_age"
			];
			var sCsv = [aColumns.join(",")].concat(aRows.map(function(oRow) {
				return aColumns.map(function(sKey) {
					return '"' + String(oRow[sKey] == null ? "" : oRow[sKey]).replace(/"/g, '""') + '"';
				}).join(",");
			})).join("\r\n");
			var oBlob = new Blob(["\ufeff" + sCsv], {
				type: "text/csv;charset=utf-8;"
			});
			var oLink = document.createElement("a");
			oLink.href = URL.createObjectURL(oBlob);
			oLink.download = "GRN_Details_" + this._activePlant + "_" + (this._activePo || "all") + ".csv";
			oLink.click();
			URL.revokeObjectURL(oLink.href);
		}
	});
});