import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from ml.predictor import disease_predictor

def test_disease_predictor_standard_symptoms():
    r = disease_predictor.predict_disease(['fever', 'cough', 'fatigue'])
    assert 'predictions' in r
    assert len(r['predictions']) > 0

def test_disease_predictor_cardiac_symptoms():
    r2 = disease_predictor.predict_disease(['shortness of breath', 'chest pain', 'dizziness'])
    assert 'predictions' in r2

def test_disease_predictor_unknown_symptom():
    r3 = disease_predictor.predict_disease(['fever', 'UNKNOWNSYM12345'])
    assert 'UNKNOWNSYM12345' in r3.get('unknownSymptoms', [])

def test_disease_predictor_all_unknown():
    r4 = disease_predictor.predict_disease(['TOTALLY_BOGUS'])
    assert r4['predictions'] == []

def test_disease_predictor_empty():
    r5 = disease_predictor.predict_disease([])
    assert r5['predictions'] == []

if __name__ == '__main__':
    test_disease_predictor_standard_symptoms()
    test_disease_predictor_cardiac_symptoms()
    test_disease_predictor_unknown_symptom()
    test_disease_predictor_all_unknown()
    test_disease_predictor_empty()
    print("All ML predictor tests passed!")
